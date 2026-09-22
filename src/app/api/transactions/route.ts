import { NextResponse } from "next/server";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, categories, categoryGroups, tags, transactionSplits, transactionTags, transactions } from "@/db/schema";
import { AuthError, requireDek, requireWriter } from "@/lib/auth";
import { nid } from "@/lib/ids";
import { dollarsToCents } from "@/lib/money";
import { applyRulesToNewTx } from "@/lib/rules";
import { todayISO } from "@/lib/dates";
import { openAccount, openSplit, openTx, sealedTxWrite } from "@/lib/secrets";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const dek = await requireDek();
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    const accountId = url.searchParams.get("accountId");
    const categoryId = url.searchParams.get("categoryId");
    const reviewed = url.searchParams.get("reviewed");
    const hidden = url.searchParams.get("hidden");
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");
    const tag = url.searchParams.get("tag")?.trim().toLowerCase() ?? "";
    const merchant = url.searchParams.get("merchant")?.trim().toLowerCase() ?? "";
    const pairFor = url.searchParams.get("pairFor");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 500);
    const offset = Number(url.searchParams.get("offset") ?? 0);

    const db = await getDb();
    if (pairFor) {
      const [raw] = await db.select().from(transactions).where(eq(transactions.id, pairFor));
      if (!raw) return NextResponse.json({ candidates: [] });
      const tx = openTx(raw, dek);
      const all = (await db.select().from(transactions)).map((row) => openTx(row, dek));
      const accts = (await db.select().from(accounts)).map((row) => openAccount(row, dek));
      const candidates = all
        .filter((other) => {
          if (other.id === tx.id || other.accountId === tx.accountId) return false;
          if (Math.sign(other.amountCents) === Math.sign(tx.amountCents) || other.amountCents === 0) return false;
          if (Math.abs(Math.abs(other.amountCents) - Math.abs(tx.amountCents)) > 1) return false;
          const days = Math.abs(Date.parse(`${other.date}T12:00:00Z`) - Date.parse(`${tx.date}T12:00:00Z`)) / 86400000;
          return days <= 5;
        })
        .slice(0, 8)
        .map((other) => ({
          id: other.id,
          name: other.name,
          date: other.date,
          amountCents: other.amountCents,
          account: accts.find((account) => account.id === other.accountId)?.name ?? null,
        }));
      return NextResponse.json({ candidates });
    }
    const filters = [];
    if (accountId) filters.push(eq(transactions.accountId, accountId));
    if (categoryId) filters.push(eq(transactions.categoryId, categoryId));
    if (reviewed === "true") filters.push(eq(transactions.reviewed, true));
    if (reviewed === "false") filters.push(eq(transactions.reviewed, false));
    if (hidden === "true") filters.push(eq(transactions.hidden, true));
    else filters.push(eq(transactions.hidden, false));
    if (start) filters.push(gte(transactions.date, start));
    if (end) filters.push(lte(transactions.date, end));

    const base = db
      .select()
      .from(transactions)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(transactions.date), desc(transactions.createdAt));
    const stored = q || tag || merchant ? await base : await base.limit(limit).offset(offset);
    let rows = stored.map((tx) => openTx(tx, dek));

    const [acctRows, catRows, groupRows, splitRows, tagRows, txTags] = await Promise.all([
      db.select().from(accounts),
      db.select().from(categories),
      db.select().from(categoryGroups),
      db.select().from(transactionSplits),
      db.select().from(tags),
      db.select().from(transactionTags),
    ]);
    const openedAccounts = acctRows.map((row) => openAccount(row, dek));
    const openedSplits = splitRows.map((row) => openSplit(row, dek));

    if (merchant) {
      rows = rows.filter((tx) => (tx.merchantName || tx.name).toLowerCase() === merchant);
    }
    if (q) {
      const amount = /^(>=|<=|>|<|=)\s*(\d+(?:\.\d+)?)$/.exec(q.trim());
      if (amount) {
        const cents = Math.round(Number(amount[2]) * 100);
        const abs = (value: number) => Math.abs(value);
        rows = rows.filter((tx) => {
          const value = abs(tx.amountCents);
          if (amount[1] === ">") return value > cents;
          if (amount[1] === ">=") return value >= cents;
          if (amount[1] === "<") return value < cents;
          if (amount[1] === "<=") return value <= cents;
          return value === cents;
        });
      } else {
        const needle = q.toLowerCase();
        rows = rows.filter((tx) =>
          `${tx.name} ${tx.merchantName ?? ""} ${tx.originalDescription ?? ""} ${tx.notes ?? ""}`.toLowerCase().includes(needle),
        );
      }
    }
    const tagged = rows.map((tx) => ({
      tx,
      tags: txTags
        .filter((t) => t.transactionId === tx.id)
        .map((t) => tagRows.find((tag) => tag.id === t.tagId))
        .filter((tag): tag is (typeof tagRows)[number] => Boolean(tag)),
    }));
    const filtered = tag ? tagged.filter((row) => row.tags.some((item) => item.name.toLowerCase() === tag)) : tagged;
    const page = q || tag || merchant ? filtered.slice(offset, offset + limit) : filtered;
    const data = page.map(({ tx, tags: txTagRows }) => {
      const category = catRows.find((c) => c.id === tx.categoryId) ?? null;
      const group = category ? groupRows.find((g) => g.id === category.groupId) : null;
      return {
        ...tx,
        account: openedAccounts.find((a) => a.id === tx.accountId) ?? null,
        category: category ? { ...category, color: group?.color ?? "#8a8175" } : null,
        splits: openedSplits.filter((s) => s.transactionId === tx.id),
        tags: txTagRows,
      };
    });

    const [{ n }] = await db
      .select({ n: sql<number>`count(*)` })
      .from(transactions)
      .where(eq(transactions.reviewed, false));

    return NextResponse.json({ transactions: data, unreviewed: Number(n) });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message === "forbidden" ? "You have view-only access." : "locked" }, { status: err.message === "forbidden" ? 403 : 401 });
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    const dek = await requireWriter();
    const body = (await request.json()) as {
      accountId: string;
      name: string;
      amount: number;
      date?: string;
      categoryId?: string;
      notes?: string;
    };
    const db = await getDb();
    const id = nid();
    const amountCents = dollarsToCents(body.amount);
    await db.insert(transactions).values({
      id,
      accountId: body.accountId,
      date: body.date ?? todayISO(),
      categoryId: body.categoryId,
      reviewed: true,
      hidden: false,
      isTransfer: body.categoryId === "cat-transfer" || body.categoryId === "cat-cc-payment",
      ...sealedTxWrite(
        {
          name: body.name,
          merchantName: body.name,
          notes: body.notes ?? null,
          amountCents,
        },
        dek,
      ),
    });
    const patch = await applyRulesToNewTx(db, id, {
      name: body.name,
      merchantName: body.name,
      amountCents,
      accountId: body.accountId,
      categoryId: body.categoryId,
    }, dek);
    if (Object.keys(patch).length) {
      await db.update(transactions).set(patch).where(eq(transactions.id, id));
    }
    return NextResponse.json({ id });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message === "forbidden" ? "You have view-only access." : "locked" }, { status: err.message === "forbidden" ? 403 : 401 });
    throw err;
  }
}
