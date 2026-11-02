import { eq } from "drizzle-orm";
import type { Transaction } from "plaid";
import { getDb } from "@/db";
import { mapPlaidCategory } from "@/db/categories";
import {
  accounts,
  holdings,
  plaidItems,
  securities,
  transactions,
} from "@/db/schema";
import { decryptSecret } from "./crypto";
import { nid } from "./ids";
import { dollarsFromPlaid, getPlaidClient } from "./plaid";
import { applyRulesToNewTx } from "./rules";
import { snapshotNetWorth } from "./networth";
import {
  openTx,
  prepareVault,
  sealedAccountWrite,
  sealedHoldingWrite,
  sealedSecurityWrite,
  sealedTxWrite,
  sealText,
} from "./secrets";

export async function syncAllItems(dek: Buffer, opts?: { pendingOnly?: boolean }) {
  const db = await getDb();
  const items = await db.select().from(plaidItems);
  const targets = opts?.pendingOnly ? items.filter((item) => item.status === "pending_sync") : items;
  const results = [];
  for (const item of targets) {
    results.push(await syncItem(item.id, dek));
  }
  if (targets.length) {
    await snapshotNetWorth(dek);
    const { confirmRecurring, previewRecurring } = await import("./recurring");
    const { refreshNotifications } = await import("./notify");
    await confirmRecurring(dek, await previewRecurring(dek));
    await refreshNotifications(dek);
  }
  return results;
}

export async function syncItem(localItemId: string, dek: Buffer) {
  const db = await getDb();
  const [item] = await db.select().from(plaidItems).where(eq(plaidItems.id, localItemId));
  if (!item) throw new Error("Item not found");
  const client = getPlaidClient();
  const access = decryptSecret(item.accessTokenEnc, dek);

  await refreshAccounts(localItemId, access, dek);

  let cursor = item.cursor ?? undefined;
  let added = 0;
  let modified = 0;
  let removed = 0;
  let hasMore = true;
  while (hasMore) {
    const res = await client.transactionsSync({
      access_token: access,
      cursor,
    });
    for (const tx of res.data.added) {
      await upsertTransaction(tx, dek);
      added += 1;
    }
    for (const tx of res.data.modified) {
      await upsertTransaction(tx, dek);
      modified += 1;
    }
    for (const tx of res.data.removed) {
      if (tx.transaction_id) {
        await db.delete(transactions).where(eq(transactions.plaidTransactionId, tx.transaction_id));
        removed += 1;
      }
    }
    hasMore = res.data.has_more;
    cursor = res.data.next_cursor;
  }

  await db
    .update(plaidItems)
    .set({ cursor, status: "ok", errorCode: null, updatedAt: new Date() })
    .where(eq(plaidItems.id, localItemId));

  try {
    await syncInvestments(localItemId, access, dek);
  } catch {
    // Item may not have investment accounts
  }
  try {
    await syncLiabilities(access, dek);
  } catch {
    // Item may not have liabilities
  }

  await prepareVault(dek);
  return { itemId: localItemId, added, modified, removed };
}

async function refreshAccounts(localItemId: string, access: string, dek: Buffer) {
  const db = await getDb();
  const client = getPlaidClient();
  const res = await client.accountsGet({ access_token: access });
  for (const acct of res.data.accounts) {
    const existing = await db
      .select()
      .from(accounts)
      .where(eq(accounts.plaidAccountId, acct.account_id));
    const payload = {
      name: acct.name,
      officialName: acct.official_name ?? null,
      type: acct.type,
      subtype: acct.subtype ?? null,
      mask: acct.mask ?? null,
      currentBalanceCents: dollarsFromPlaid(acct.balances.current),
      availableBalanceCents: acct.balances.available == null ? null : dollarsFromPlaid(acct.balances.available),
      isoCurrency: acct.balances.iso_currency_code ?? "USD",
      updatedAt: new Date(),
    };
    const sealed = sealedAccountWrite(payload, dek);
    if (existing[0]) {
      await db.update(accounts).set({ ...payload, ...sealed }).where(eq(accounts.id, existing[0].id));
    } else {
      await db.insert(accounts).values({
        id: nid(),
        plaidItemId: localItemId,
        plaidAccountId: acct.account_id,
        isManual: false,
        ...payload,
        ...sealed,
      });
    }
  }
}

async function upsertTransaction(tx: Transaction, dek: Buffer) {
  const db = await getDb();
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.plaidAccountId, tx.account_id));
  if (!account) return;

  const pfcPrimary = tx.personal_finance_category?.primary ?? null;
  const pfcDetailed = tx.personal_finance_category?.detailed ?? null;
  const mapped = mapPlaidCategory(pfcPrimary, pfcDetailed);
  const isTransfer = mapped === "cat-transfer" || mapped === "cat-cc-payment" || mapped === "cat-invest";

  const existing = tx.transaction_id
    ? await db.select().from(transactions).where(eq(transactions.plaidTransactionId, tx.transaction_id))
    : [];
  const prior = existing[0] ? openTx(existing[0], dek) : null;

  const base = {
    accountId: account.id,
    date: tx.date,
    authorizedDate: tx.authorized_date ?? null,
    pending: Boolean(tx.pending),
    pfcPrimary,
    pfcDetailed,
    updatedAt: new Date(),
    ...sealedTxWrite(
      {
        name: tx.merchant_name || tx.name,
        merchantName: tx.merchant_name ?? null,
        originalDescription: tx.original_description ?? tx.name,
        notes: prior?.notes ?? null,
        amountCents: dollarsFromPlaid(tx.amount),
      },
      dek,
    ),
  };

  if (existing[0]) {
    await db
      .update(transactions)
      .set({
        ...base,
        categoryId: existing[0].reviewed ? existing[0].categoryId : mapped,
        isTransfer: existing[0].reviewed ? existing[0].isTransfer : isTransfer,
      })
      .where(eq(transactions.id, existing[0].id));
    return;
  }

  const id = nid();
  const plainName = tx.merchant_name || tx.name;
  await db.insert(transactions).values({
    id,
    plaidTransactionId: tx.transaction_id,
    categoryId: mapped,
    isTransfer,
    reviewed: false,
    hidden: false,
    ...base,
  });
  const patch = await applyRulesToNewTx(
    db,
    id,
    {
      name: plainName,
      merchantName: tx.merchant_name ?? null,
      originalDescription: tx.original_description ?? tx.name,
      amountCents: dollarsFromPlaid(tx.amount),
      accountId: account.id,
      categoryId: mapped,
    },
    dek,
  );
  if (Object.keys(patch).length) {
    await db.update(transactions).set({ ...patch, ...(patch.categoryId ? { reviewed: true } : {}), updatedAt: new Date() }).where(eq(transactions.id, id));
  }
}

async function syncInvestments(localItemId: string, access: string, dek: Buffer) {
  const db = await getDb();
  const client = getPlaidClient();
  const res = await client.investmentsHoldingsGet({ access_token: access });
  const itemAccounts = await db.select().from(accounts).where(eq(accounts.plaidItemId, localItemId));
  const accountIds = new Set(itemAccounts.map((a) => a.id));

  for (const sec of res.data.securities) {
    const existing = await db
      .select()
      .from(securities)
      .where(eq(securities.plaidSecurityId, sec.security_id));
    const payload = {
      type: sec.type ?? null,
      closePriceAsOf: sec.close_price_as_of ?? null,
      ...sealedSecurityWrite(
        {
          name: sec.name ?? sec.ticker_symbol ?? "Security",
          ticker: sec.ticker_symbol ?? null,
          closePriceCents: sec.close_price == null ? null : dollarsFromPlaid(sec.close_price),
        },
        dek,
      ),
    };
    if (existing[0]) {
      await db.update(securities).set(payload).where(eq(securities.id, existing[0].id));
    } else {
      await db.insert(securities).values({
        id: nid(),
        plaidSecurityId: sec.security_id,
        ...payload,
      });
    }
  }

  for (const acc of itemAccounts) {
    if (acc.plaidAccountId) {
      const rows = await db.select().from(holdings).where(eq(holdings.accountId, acc.id));
      for (const row of rows) {
        await db.delete(holdings).where(eq(holdings.id, row.id));
      }
    }
  }

  for (const hold of res.data.holdings) {
    const account = itemAccounts.find((a) => a.plaidAccountId === hold.account_id);
    const [security] = await db
      .select()
      .from(securities)
      .where(eq(securities.plaidSecurityId, hold.security_id));
    if (!account || !security || !accountIds.has(account.id)) continue;
    await db.insert(holdings).values({
      id: nid(),
      accountId: account.id,
      securityId: security.id,
      ...sealedHoldingWrite(
        {
          quantity: String(hold.quantity ?? 0),
          costBasisCents: hold.cost_basis == null ? null : dollarsFromPlaid(hold.cost_basis),
          institutionValueCents: dollarsFromPlaid(hold.institution_value),
          institutionPriceCents: hold.institution_price == null ? null : dollarsFromPlaid(hold.institution_price),
        },
        dek,
      ),
    });
  }
}

async function syncLiabilities(access: string, dek: Buffer) {
  const db = await getDb();
  const client = getPlaidClient();
  const res = await client.liabilitiesGet({ access_token: access });
  const cards = res.data.liabilities.credit ?? [];
  const mortgages = res.data.liabilities.mortgage ?? [];
  const students = res.data.liabilities.student ?? [];
  for (const card of cards) {
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.plaidAccountId, card.account_id ?? ""));
    if (!account) continue;
    await db
      .update(accounts)
      .set({ liabilityJson: sealText(JSON.stringify({ kind: "credit", ...card }), dek), updatedAt: new Date() })
      .where(eq(accounts.id, account.id));
  }
  for (const loan of [...mortgages, ...students]) {
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.plaidAccountId, loan.account_id ?? ""));
    if (!account) continue;
    await db
      .update(accounts)
      .set({
        liabilityJson: sealText(
          JSON.stringify({
            kind: "loan",
            ...loan,
          }),
          dek,
        ),
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, account.id));
  }
}
