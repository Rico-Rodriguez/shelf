import { and, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { budgetItems, budgetMonths, categories, settings, transactionSplits, transactions } from "@/db/schema";
import { addMonths, monthRange } from "./dates";
import { nid } from "./ids";
import {
  openBudgetItem,
  openBudgetMonth,
  openSettings,
  openSplit,
  openTx,
  sealedBudgetItemWrite,
  sealedBudgetMonthWrite,
} from "./secrets";

export type FlexBucket = "fixed" | "non_monthly" | "flex";

export async function getOrCreateBudgetMonth(year: number, month: number, dek: Buffer) {
  const db = await getDb();
  const existing = await db
    .select()
    .from(budgetMonths)
    .where(and(eq(budgetMonths.year, year), eq(budgetMonths.month, month)));
  if (existing[0]) return openBudgetMonth(existing[0], dek);

  const [cfgRow] = await db.select().from(settings);
  const cfg = cfgRow ? openSettings(cfgRow, dek) : null;
  const prev = addMonths(year, month, -1);
  const prevMonth = await db
    .select()
    .from(budgetMonths)
    .where(and(eq(budgetMonths.year, prev.year), eq(budgetMonths.month, prev.month)));
  const prevOpened = prevMonth[0] ? openBudgetMonth(prevMonth[0], dek) : null;
  const income = prevOpened?.plannedIncomeCents ?? cfg?.plannedIncomeCents ?? 0;
  const flexPool = prevOpened?.flexPoolCents ?? 0;
  // A month copied from a sample month is still sample data, so clearing samples resets it too.
  const isSample = prevMonth[0]?.isSample ?? false;

  const row = {
    id: nid(),
    year,
    month,
    isSample,
    ...sealedBudgetMonthWrite(income, dek, flexPool),
  };
  await db.insert(budgetMonths).values(row);

  const cats = await db.select().from(categories);
  const prevItems = prevMonth[0]
    ? (await db.select().from(budgetItems).where(eq(budgetItems.budgetMonthId, prevMonth[0].id))).map((item) =>
        openBudgetItem(item, dek),
      )
    : [];
  const spentPrev = prevMonth[0] ? await spentByCategory(prev.year, prev.month, dek) : {};

  for (const cat of cats) {
    if (cat.kind !== "expense") continue;
    const prevItem = prevItems.find((p) => p.categoryId === cat.id);
    const planned = prevItem?.plannedCents ?? 0;
    let rolloverIn = 0;
    if (cat.rollover && prevItem) {
      const leftover = prevItem.plannedCents + prevItem.rolloverInCents - (spentPrev[cat.id] ?? 0);
      rolloverIn = leftover > 0 ? leftover : 0;
    }
    await db.insert(budgetItems).values({
      id: nid(),
      budgetMonthId: row.id,
      categoryId: cat.id,
      isSample: Boolean(prevItem?.isSample),
      ...sealedBudgetItemWrite(planned, rolloverIn, dek),
    });
  }

  return openBudgetMonth({ ...row, plannedIncomeCents: income, secretEnc: row.secretEnc }, dek);
}

const TRANSFER_CATEGORIES = new Set(["cat-transfer", "cat-cc-payment", "cat-invest"]);

/** Mortgage and rent payments were stored as transfers, so the budget never showed them. */
export async function rehomeMisfiledBills() {
  const db = await getDb();
  const rows = await db
    .select({
      id: transactions.id,
      categoryId: transactions.categoryId,
      isTransfer: transactions.isTransfer,
      pfcDetailed: transactions.pfcDetailed,
    })
    .from(transactions);
  for (const row of rows) {
    const categoryId =
      row.pfcDetailed === "LOAN_PAYMENTS_MORTGAGE_PAYMENT" || row.pfcDetailed === "RENT_AND_UTILITIES_RENT"
        ? "cat-rent"
        : row.pfcDetailed === "LOAN_PAYMENTS_CAR_PAYMENT"
          ? "cat-auto"
          : null;
    if (!categoryId) continue;
    const misfiled = row.isTransfer || (row.categoryId != null && TRANSFER_CATEGORIES.has(row.categoryId));
    if (!misfiled || (row.categoryId === categoryId && !row.isTransfer)) continue;
    await db.update(transactions).set({ categoryId, isTransfer: false, updatedAt: new Date() }).where(eq(transactions.id, row.id));
  }
}

export async function spentByCategory(year: number, month: number, dek: Buffer): Promise<Record<string, number>> {
  await rehomeMisfiledBills();
  const db = await getDb();
  const { start, end } = monthRange(year, month);
  const txs = (
    await db
      .select()
      .from(transactions)
      .where(and(gte(transactions.date, start), lte(transactions.date, end)))
  ).map((tx) => openTx(tx, dek));
  const splits = (await db.select().from(transactionSplits)).map((split) => openSplit(split, dek));
  const out: Record<string, number> = {};
  for (const tx of txs) {
    if (tx.hidden || tx.isTransfer) continue;
    if (tx.amountCents <= 0) continue;
    const txSplits = splits.filter((s) => s.transactionId === tx.id);
    if (txSplits.length) {
      for (const s of txSplits) {
        if (!s.categoryId) continue;
        out[s.categoryId] = (out[s.categoryId] ?? 0) + s.amountCents;
      }
    } else {
      const categoryId = tx.categoryId || "cat-uncategorized";
      out[categoryId] = (out[categoryId] ?? 0) + tx.amountCents;
    }
  }
  return out;
}

/** Cumulative categorized spending through the month, one point per day that had spend. */
export async function spendByDay(
  year: number,
  month: number,
  dek: Buffer,
  includeCategory?: (categoryId: string) => boolean,
) {
  const db = await getDb();
  const { start, end } = monthRange(year, month);
  const txs = (
    await db
      .select()
      .from(transactions)
      .where(and(gte(transactions.date, start), lte(transactions.date, end)))
  ).map((tx) => openTx(tx, dek));
  const splits = (await db.select().from(transactionSplits)).map((split) => openSplit(split, dek));
  const daily: Record<string, number> = {};
  for (const tx of txs) {
    if (tx.hidden || tx.isTransfer) continue;
    if (tx.amountCents <= 0) continue;
    const txSplits = splits.filter((split) => split.transactionId === tx.id);
    let cents = 0;
    if (txSplits.length) {
      for (const split of txSplits) {
        if (!split.categoryId) continue;
        if (includeCategory && !includeCategory(split.categoryId)) continue;
        cents += split.amountCents;
      }
    } else {
      const categoryId = tx.categoryId || "cat-uncategorized";
      if (!includeCategory || includeCategory(categoryId)) cents = tx.amountCents;
    }
    if (cents <= 0) continue;
    daily[tx.date] = (daily[tx.date] ?? 0) + cents;
  }
  let run = 0;
  return Object.keys(daily)
    .sort()
    .map((date) => {
      run += daily[date];
      return { date, cents: run };
    });
}

export async function trailingCategoryAverage(year: number, month: number, dek: Buffer) {
  const samples: Record<string, number>[] = [];
  for (let i = 1; i <= 3; i += 1) {
    const prev = addMonths(year, month, -i);
    const spent = await spentByCategory(prev.year, prev.month, dek);
    if (Object.values(spent).some((cents) => cents > 0)) samples.push(spent);
  }
  const byCategory: Record<string, number> = {};
  if (!samples.length) return { byCategory, total: null as number | null };
  for (const spent of samples) {
    for (const [id, cents] of Object.entries(spent)) byCategory[id] = (byCategory[id] ?? 0) + cents;
  }
  for (const id of Object.keys(byCategory)) byCategory[id] = Math.round(byCategory[id] / samples.length);
  const total = Math.round(
    samples.reduce((sum, spent) => sum + Object.values(spent).reduce((inner, cents) => inner + cents, 0), 0) / samples.length,
  );
  return { byCategory, total };
}

export async function pendingOutflow(year: number, month: number, dek: Buffer) {
  const db = await getDb();
  const { start, end } = monthRange(year, month);
  const txs = (
    await db
      .select()
      .from(transactions)
      .where(and(gte(transactions.date, start), lte(transactions.date, end)))
  ).map((tx) => openTx(tx, dek));
  return txs
    .filter((tx) => tx.pending && !tx.hidden && !tx.isTransfer && tx.amountCents > 0)
    .reduce((sum, tx) => sum + tx.amountCents, 0);
}

export async function pendingInMonth(year: number, month: number, dek: Buffer): Promise<number> {
  return pendingOutflow(year, month, dek);
}

export async function readMonthLeft(year: number, month: number, dek: Buffer): Promise<number | null> {
  const db = await getDb();
  const existing = await db
    .select()
    .from(budgetMonths)
    .where(and(eq(budgetMonths.year, year), eq(budgetMonths.month, month)));
  if (!existing[0]) return null;
  const monthRow = openBudgetMonth(existing[0], dek);
  const items = (await db.select().from(budgetItems).where(eq(budgetItems.budgetMonthId, existing[0].id))).map((row) =>
    openBudgetItem(row, dek),
  );
  const planned = items.reduce((sum, item) => sum + item.plannedCents + item.rolloverInCents, 0);
  return monthRow.plannedIncomeCents - planned;
}

export async function incomeInMonth(year: number, month: number, dek: Buffer): Promise<number> {
  const db = await getDb();
  const { start, end } = monthRange(year, month);
  const txs = (
    await db
      .select()
      .from(transactions)
      .where(and(gte(transactions.date, start), lte(transactions.date, end)))
  ).map((tx) => openTx(tx, dek));
  const cats = await db.select().from(categories);
  const incomeIds = new Set(cats.filter((c) => c.kind === "income").map((c) => c.id));
  let total = 0;
  for (const tx of txs) {
    if (tx.hidden || tx.pending) continue;
    if (tx.categoryId && incomeIds.has(tx.categoryId) && tx.amountCents < 0) {
      total += Math.abs(tx.amountCents);
    }
  }
  return total;
}

export async function suggestBudget(year: number, month: number, dek: Buffer) {
  const db = await getDb();
  const lookback: Record<string, number[]> = {};
  for (let i = 1; i <= 3; i += 1) {
    const m = addMonths(year, month, -i);
    const spent = await spentByCategory(m.year, m.month, dek);
    for (const [cat, amt] of Object.entries(spent)) {
      lookback[cat] = lookback[cat] ?? [];
      lookback[cat].push(amt);
    }
  }
  const suggested: Record<string, number> = {};
  for (const [cat, amounts] of Object.entries(lookback)) {
    const avg = Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length);
    suggested[cat] = avg;
  }
  const incomeSamples: number[] = [];
  for (let i = 1; i <= 3; i += 1) {
    const m = addMonths(year, month, -i);
    incomeSamples.push(await incomeInMonth(m.year, m.month, dek));
  }
  const suggestedIncome = incomeSamples.length
    ? Math.round(incomeSamples.reduce((a, b) => a + b, 0) / incomeSamples.length)
    : 0;
  void db;
  return { suggested, suggestedIncome };
}
