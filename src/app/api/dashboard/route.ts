import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { budgetItems, holdings, plaidItems, recurrences, settings, transactions } from "@/db/schema";
import { AuthError, requireDek, requireUnlocked } from "@/lib/auth";
import { getOrCreateBudgetMonth, spentByCategory } from "@/lib/budget";
import { yearMonth } from "@/lib/dates";
import { computeNetWorth } from "@/lib/networth";
import { plaidConfigured, TRIAL_ITEM_LIMIT } from "@/lib/plaid";
import { openBudgetItem, openHolding, openRecurrence, openTx } from "@/lib/secrets";

export const dynamic = "force-dynamic";

const DEFAULT_LAYOUT = ["netWorth", "budget", "unreviewed", "recurring", "transactions", "investments"];

export async function GET() {
  try {
    const dek = await requireDek();
    const db = await getDb();
    const now = yearMonth();
    const [cfg] = await db.select().from(settings);
    const monthRow = await getOrCreateBudgetMonth(now.year, now.month, dek);
    const spent = await spentByCategory(now.year, now.month, dek);
    const spentTotal = Object.values(spent).reduce((a, b) => a + b, 0);
    const plannedRows = (await db.select().from(budgetItems).where(eq(budgetItems.budgetMonthId, monthRow.id))).map((row) =>
      openBudgetItem(row, dek),
    );
    const planned = plannedRows.reduce((s, r) => s + r.plannedCents + r.rolloverInCents, 0);

    const recent = (await db.select().from(transactions).orderBy(desc(transactions.date)).limit(8)).map((row) => openTx(row, dek));
    const unreviewed = (await db.select().from(transactions).where(eq(transactions.reviewed, false)))
      .map((row) => openTx(row, dek))
      .filter((t) => !t.hidden);
    const upcoming = (await db.select().from(recurrences))
      .map((row) => openRecurrence(row, dek))
      .filter((r) => r.isActive)
      .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
      .slice(0, 6);
    const holds = (await db.select().from(holdings)).map((row) => openHolding(row, dek));
    const investTotal = holds.reduce((s, h) => s + h.institutionValueCents, 0);
    const nw = await computeNetWorth(dek);
    const itemsPlaid = await db.select().from(plaidItems);

    let layout = DEFAULT_LAYOUT;
    try {
      const parsed = JSON.parse(cfg?.dashboardLayout ?? "[]");
      if (Array.isArray(parsed) && parsed.length) layout = parsed;
    } catch {
      layout = DEFAULT_LAYOUT;
    }

    return NextResponse.json({
      layout,
      netWorth: nw,
      budget: {
        plannedCents: planned,
        spentCents: spentTotal,
        remainingCents: planned - spentTotal,
        mode: cfg?.budgetMode ?? "category",
      },
      unreviewed: { count: unreviewed.length, items: unreviewed.slice(0, 6) },
      recurring: upcoming,
      transactions: recent,
      investments: { totalCents: investTotal, count: holds.length },
      plaidConfigured: plaidConfigured(),
      itemCount: itemsPlaid.length,
      trialLimit: TRIAL_ITEM_LIMIT,
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}

export async function PUT(request: Request) {
  try {
    await requireUnlocked();
    const body = (await request.json()) as { layout: string[] };
    const db = await getDb();
    await db.update(settings).set({ dashboardLayout: JSON.stringify(body.layout) }).where(eq(settings.id, "default"));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}
