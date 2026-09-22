import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, budgetItems, goalAccounts, goals, holdings, netWorthSnapshots, plaidItems, recurrences, settings, transactions } from "@/db/schema";
import { AuthError, requireDek, requireWriter } from "@/lib/auth";
import { getOrCreateBudgetMonth, incomeInMonth, spentByCategory } from "@/lib/budget";
import { yearMonth } from "@/lib/dates";
import { refreshNotifications } from "@/lib/notify";
import { computeNetWorth } from "@/lib/networth";
import { plaidConfigured, TRIAL_ITEM_LIMIT } from "@/lib/plaid";
import { openAccount, openBudgetItem, openGoal, openHolding, openRecurrence, openSnapshot, openTx } from "@/lib/secrets";
import { goalPace } from "@/lib/goal-pace";
import { classifyAccount } from "@/lib/networth";

export const dynamic = "force-dynamic";

const DEFAULT_LAYOUT = ["netWorth", "cashFlow", "budget", "unreviewed", "recurring", "goals", "transactions", "investments"];
const LEGACY_LAYOUT = ["netWorth", "budget", "unreviewed", "recurring", "transactions", "investments"];

function parseLayout(raw: string | null | undefined) {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw ?? "null");
  } catch {
    parsed = null;
  }
  if (!Array.isArray(parsed)) return DEFAULT_LAYOUT.map((id) => ({ id, hidden: false }));
  if (parsed.every((item) => typeof item === "string")) {
    const visible = parsed.filter((id): id is string => typeof id === "string" && DEFAULT_LAYOUT.includes(id));
    const omitted = DEFAULT_LAYOUT.filter((id) => !visible.includes(id));
    const hidden = omitted.filter((id) => LEGACY_LAYOUT.includes(id));
    const added = omitted.filter((id) => !LEGACY_LAYOUT.includes(id));
    return [
      ...visible.map((id) => ({ id, hidden: false })),
      ...added.map((id) => ({ id, hidden: false })),
      ...hidden.map((id) => ({ id, hidden: true })),
    ];
  }
  const items = parsed
    .filter((item): item is { id: string; hidden?: boolean } => Boolean(item) && typeof item === "object" && typeof (item as { id?: string }).id === "string")
    .filter((item) => DEFAULT_LAYOUT.includes(item.id))
    .map((item) => ({ id: item.id, hidden: Boolean(item.hidden) }));
  for (const id of DEFAULT_LAYOUT) {
    if (!items.some((item) => item.id === id)) items.push({ id, hidden: false });
  }
  return items;
}

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
    const income = await incomeInMonth(now.year, now.month, dek);
    const goalRows = (await db.select().from(goals)).map((row) => openGoal(row, dek));
    const links = await db.select().from(goalAccounts);
    const openedAccounts = (await db.select().from(accounts)).map((row) => openAccount(row, dek));
    const snapshots = (await db.select().from(netWorthSnapshots)).map((row) => openSnapshot(row, dek)).sort((a, b) => a.date.localeCompare(b.date)).slice(-18);
    const layout = parseLayout(cfg?.dashboardLayout);
    await refreshNotifications(dek);

    return NextResponse.json({
      layout,
      netWorth: nw,
      snapshots: snapshots.map((row) => ({ date: row.date, netWorthCents: row.netWorthCents })),
      cashFlow: { incomeCents: income, spendingCents: spentTotal, savedCents: income - spentTotal },
      goals: goalRows.slice(0, 4).map((goal) => {
        const linked = links
          .filter((link) => link.goalId === goal.id)
          .map((link) => openedAccounts.find((account) => account.id === link.accountId))
          .filter((account): account is (typeof openedAccounts)[number] => Boolean(account));
        const progressCents =
          goal.kind === "save_up"
            ? linked.reduce((sum, account) => sum + (classifyAccount(account.type) === "asset" ? account.currentBalanceCents : 0), 0)
            : Math.max(
                0,
                goal.targetCents - linked.reduce((sum, account) => sum + Math.abs(account.currentBalanceCents), 0),
              );
        const remainingCents =
          goal.kind === "pay_down"
            ? linked.reduce((sum, account) => sum + Math.abs(account.currentBalanceCents), 0)
            : Math.max(0, goal.targetCents - progressCents);
        return {
          id: goal.id,
          name: goal.name,
          targetCents: goal.targetCents,
          targetDate: goal.targetDate,
          kind: goal.kind,
          progressCents,
          remainingCents,
          pace: goalPace({ targetCents: goal.targetCents, targetDate: goal.targetDate, progressCents, remainingCents }),
        };
      }),
      accountCount: openedAccounts.filter((account) => !account.isHidden).length,
      budget: {
        plannedCents: planned,
        spentCents: spentTotal,
        remainingCents: planned - spentTotal,
        mode: cfg?.budgetMode ?? "category",
      },
      unreviewed: {
        count: unreviewed.length,
        amountCents: unreviewed.reduce((sum, tx) => sum + tx.amountCents, 0),
        items: unreviewed.slice(0, 6),
      },
      recurring: upcoming,
      transactions: recent,
      investments: { totalCents: investTotal, count: holds.length },
      plaidConfigured: plaidConfigured(),
      itemCount: itemsPlaid.length,
      trialLimit: TRIAL_ITEM_LIMIT,
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message === "forbidden" ? "You have view-only access." : "locked" }, { status: err.message === "forbidden" ? 403 : 401 });
    throw err;
  }
}

export async function PUT(request: Request) {
  try {
    await requireWriter();
    const body = (await request.json()) as { layout: { id: string; hidden?: boolean }[] | string[] };
    const db = await getDb();
    const layout = Array.isArray(body.layout)
      ? body.layout
          .map((item) => (typeof item === "string" ? { id: item, hidden: false } : { id: item.id, hidden: Boolean(item.hidden) }))
          .filter((item) => DEFAULT_LAYOUT.includes(item.id))
      : DEFAULT_LAYOUT.map((id) => ({ id, hidden: false }));
    await db.update(settings).set({ dashboardLayout: JSON.stringify(layout) }).where(eq(settings.id, "default"));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message === "forbidden" ? "You have view-only access." : "locked" }, { status: err.message === "forbidden" ? 403 : 401 });
    throw err;
  }
}
