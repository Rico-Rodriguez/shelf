import { and, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { budgetItems, budgetMonths, categories, settings, transactionSplits, transactions } from "@/db/schema";
import { addMonths, monthRange } from "./dates";
import { nid } from "./ids";

export type FlexBucket = "fixed" | "non_monthly" | "flex";

export async function getOrCreateBudgetMonth(year: number, month: number) {
  const db = await getDb();
  const existing = await db
    .select()
    .from(budgetMonths)
    .where(and(eq(budgetMonths.year, year), eq(budgetMonths.month, month)));
  if (existing[0]) return existing[0];

  const [cfg] = await db.select().from(settings);
  const prev = addMonths(year, month, -1);
  const prevMonth = await db
    .select()
    .from(budgetMonths)
    .where(and(eq(budgetMonths.year, prev.year), eq(budgetMonths.month, prev.month)));

  const row = {
    id: nid(),
    year,
    month,
    plannedIncomeCents: prevMonth[0]?.plannedIncomeCents ?? cfg?.plannedIncomeCents ?? 0,
  };
  await db.insert(budgetMonths).values(row);

  const cats = await db.select().from(categories);
  const prevItems = prevMonth[0]
    ? await db.select().from(budgetItems).where(eq(budgetItems.budgetMonthId, prevMonth[0].id))
    : [];
  const spentPrev = prevMonth[0] ? await spentByCategory(prev.year, prev.month) : {};

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
      plannedCents: planned,
      rolloverInCents: rolloverIn,
    });
  }

  return row;
}

export async function spentByCategory(year: number, month: number): Promise<Record<string, number>> {
  const db = await getDb();
  const { start, end } = monthRange(year, month);
  const txs = await db
    .select()
    .from(transactions)
    .where(and(gte(transactions.date, start), lte(transactions.date, end)));
  const splits = await db.select().from(transactionSplits);
  const out: Record<string, number> = {};
  for (const tx of txs) {
    if (tx.hidden || tx.isTransfer || tx.pending) continue;
    if (tx.amountCents <= 0) continue;
    const txSplits = splits.filter((s) => s.transactionId === tx.id);
    if (txSplits.length) {
      for (const s of txSplits) {
        if (!s.categoryId) continue;
        out[s.categoryId] = (out[s.categoryId] ?? 0) + s.amountCents;
      }
    } else if (tx.categoryId) {
      out[tx.categoryId] = (out[tx.categoryId] ?? 0) + tx.amountCents;
    }
  }
  return out;
}

export async function incomeInMonth(year: number, month: number): Promise<number> {
  const db = await getDb();
  const { start, end } = monthRange(year, month);
  const txs = await db
    .select()
    .from(transactions)
    .where(and(gte(transactions.date, start), lte(transactions.date, end)));
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

export async function suggestBudget(year: number, month: number) {
  const db = await getDb();
  const lookback: Record<string, number[]> = {};
  for (let i = 1; i <= 3; i += 1) {
    const m = addMonths(year, month, -i);
    const spent = await spentByCategory(m.year, m.month);
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
    incomeSamples.push(await incomeInMonth(m.year, m.month));
  }
  const suggestedIncome = incomeSamples.length
    ? Math.round(incomeSamples.reduce((a, b) => a + b, 0) / incomeSamples.length)
    : 0;
  void db;
  return { suggested, suggestedIncome };
}
