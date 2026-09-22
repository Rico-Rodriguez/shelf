import { and, eq, isNull, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, budgetItems, categories, notifications, plaidItems, recurrences, transactions } from "@/db/schema";
import { getOrCreateBudgetMonth, spentByCategory } from "./budget";
import { addDays, todayISO, yearMonth } from "./dates";
import { formatMoney } from "./money";
import { nid } from "./ids";
import { merchantKey, priceDrift } from "./plan";
import { openAccount, openBudgetItem, openRecurrence, openTx } from "./secrets";

type Note = { kind: string; title: string; body: string; href: string; dedupeKey: string };

export async function refreshNotifications(dek: Buffer) {
  const db = await getDb();
  const today = todayISO();
  const notes: Note[] = [];

  const unreviewed = (await db.select().from(transactions).where(eq(transactions.reviewed, false)))
    .map((row) => openTx(row, dek))
    .filter((tx) => !tx.hidden);
  if (unreviewed.length) {
    notes.push({
      kind: "review",
      title: `${unreviewed.length} to review`,
      body: "New transactions are waiting.",
      href: "/transactions?reviewed=false",
      dedupeKey: `review:${today}`,
    });
  } else {
    await db.delete(notifications).where(and(eq(notifications.kind, "review"), isNull(notifications.readAt)));
  }

  const allRecurring = (await db.select().from(recurrences)).map((row) => openRecurrence(row, dek));
  const upcoming = allRecurring.filter((row) => row.isActive && !row.isIncome && row.nextDate >= today && row.nextDate <= addDays(today, 3));
  const upcomingIds = new Set(upcoming.map((row) => `bill:${row.id}:${row.nextDate}`));
  for (const bill of upcoming) {
    notes.push({
      kind: "bill",
      title: bill.merchantName,
      body: `${formatMoney(bill.amountCents)} due ${bill.nextDate}`,
      href: "/recurring",
      dedupeKey: `bill:${bill.id}:${bill.nextDate}`,
    });
  }

  const now = yearMonth();
  const month = await getOrCreateBudgetMonth(now.year, now.month, dek);
  const spent = await spentByCategory(now.year, now.month, dek);
  const items = (await db.select().from(budgetItems).where(eq(budgetItems.budgetMonthId, month.id))).map((row) =>
    openBudgetItem(row, dek),
  );
  const cats = await db.select().from(categories);
  const overKeys = new Set<string>();
  for (const item of items) {
    const available = item.plannedCents + item.rolloverInCents;
    const used = spent[item.categoryId] ?? 0;
    if (available <= 0 || used <= available) continue;
    const name = cats.find((cat) => cat.id === item.categoryId)?.name ?? "A category";
    const key = `over:${item.categoryId}:${now.year}-${now.month}`;
    overKeys.add(key);
    notes.push({
      kind: "budget",
      title: `${name} is over budget`,
      body: `${formatMoney(used - available)} above the plan`,
      href: "/budget",
      dedupeKey: key,
    });
  }

  const itemsPlaid = await db.select().from(plaidItems).where(eq(plaidItems.status, "error"));
  for (const item of itemsPlaid) {
    notes.push({
      kind: "sync",
      title: "A bank needs attention",
      body: item.errorCode || "The connection needs a refresh.",
      href: "/accounts",
      dedupeKey: `sync:${item.id}:${item.errorCode ?? "error"}`,
    });
  }

  const openedTx = (await db.select().from(transactions)).map((row) => openTx(row, dek));
  const yesterday = addDays(today, -1);
  for (const tx of openedTx) {
    if (tx.hidden || tx.isTransfer || tx.pending || tx.amountCents < 25000 || tx.date < yesterday) continue;
    notes.push({
      kind: "large",
      title: tx.merchantName || tx.name,
      body: `${formatMoney(tx.amountCents)} posted ${tx.date}`,
      href: "/transactions",
      dedupeKey: `large:${tx.id}`,
    });
  }
  for (const bill of allRecurring) {
    if (!bill.isActive || bill.isIncome) continue;
    const key = merchantKey(bill.merchantName);
    const last = openedTx
      .filter((tx) => !tx.pending && merchantKey(tx.merchantName || tx.name) === key)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!last) continue;
    const drift = priceDrift(bill.amountCents, Math.abs(last.amountCents));
    if (drift == null) continue;
    notes.push({
      kind: "price",
      title: `${bill.merchantName} changed price`,
      body: `${formatMoney(Math.abs(drift))} ${drift > 0 ? "higher" : "lower"} than usual`,
      href: "/recurring",
      dedupeKey: `price:${bill.id}:${last.date}`,
    });
  }
  const cash = (await db.select().from(accounts))
    .map((row) => openAccount(row, dek))
    .filter((account) => !account.isHidden && (account.type === "depository" || account.type === "cash"))
    .reduce((sum, account) => sum + (account.availableBalanceCents ?? account.currentBalanceCents), 0);
  const soon = allRecurring
    .filter((row) => row.isActive && !row.isIncome && row.nextDate >= today && row.nextDate <= addDays(today, 14))
    .reduce((sum, row) => sum + row.amountCents, 0);
  if (cash < 10000 || (soon > 0 && cash < soon)) {
    notes.push({
      kind: "cash",
      title: "Cash is running low",
      body: soon > cash ? `${formatMoney(cash)} on hand, ${formatMoney(soon)} in bills over 14 days` : `${formatMoney(cash)} in cash accounts`,
      href: "/accounts",
      dedupeKey: `cash:${today}`,
    });
  }

  for (const note of notes) {
    const [existing] = await db.select().from(notifications).where(eq(notifications.dedupeKey, note.dedupeKey));
    if (existing) {
      if (!existing.readAt) {
        await db.update(notifications).set({ title: note.title, body: note.body, href: note.href }).where(eq(notifications.id, existing.id));
      }
      continue;
    }
    await db.insert(notifications).values({ id: nid(), ...note });
  }

  const staleBills = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.kind, "bill"), isNull(notifications.readAt), lte(notifications.createdAt, new Date(Date.now() - 10 * 86400000))));
  for (const row of staleBills) {
    if (row.dedupeKey && !upcomingIds.has(row.dedupeKey)) {
      await db.delete(notifications).where(eq(notifications.id, row.id));
    }
  }
  const staleOver = await db.select().from(notifications).where(and(eq(notifications.kind, "budget"), isNull(notifications.readAt)));
  for (const row of staleOver) {
    if (row.dedupeKey && !overKeys.has(row.dedupeKey)) {
      await db.delete(notifications).where(eq(notifications.id, row.id));
    }
  }

}
