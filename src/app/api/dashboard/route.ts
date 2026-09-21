import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { budgetItems, holdings, plaidItems, recurrences, settings, transactions } from "@/db/schema";
import { AuthError, requireUnlocked } from "@/lib/auth";
import { getOrCreateBudgetMonth, spentByCategory } from "@/lib/budget";
import { yearMonth } from "@/lib/dates";
import { computeNetWorth } from "@/lib/networth";
import { plaidConfigured, TRIAL_ITEM_LIMIT } from "@/lib/plaid";

export const dynamic = "force-dynamic";

const DEFAULT_LAYOUT = ["netWorth", "budget", "unreviewed", "recurring", "transactions", "investments"];

export async function GET() {
  try {
    await requireUnlocked();
    const db = await getDb();
    const now = yearMonth();
    const [cfg] = await db.select().from(settings);
    const monthRow = await getOrCreateBudgetMonth(now.year, now.month);
    const spent = await spentByCategory(now.year, now.month);
    const spentTotal = Object.values(spent).reduce((a, b) => a + b, 0);
    const plannedRows = await db.select().from(budgetItems).where(eq(budgetItems.budgetMonthId, monthRow.id));
    const planned = plannedRows.reduce((s, r) => s + r.plannedCents + r.rolloverInCents, 0);

    const recent = await db.select().from(transactions).orderBy(desc(transactions.date)).limit(8);
    const unreviewed = (await db.select().from(transactions).where(eq(transactions.reviewed, false))).filter((t) => !t.hidden);
    const upcoming = (await db.select().from(recurrences))
      .filter((r) => r.isActive)
      .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
      .slice(0, 6);
    const holds = await db.select().from(holdings);
    const investTotal = holds.reduce((s, h) => s + h.institutionValueCents, 0);
    const nw = await computeNetWorth();
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
