import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, budgetItems, categories, categoryGroups, plaidItems, recurrences, settings, transactions } from "@/db/schema";
import { AuthError, requireDek, requireWriter } from "@/lib/auth";
import { getOrCreateBudgetMonth, incomeInMonth, spendByDay, spentByCategory } from "@/lib/budget";
import { yearMonth } from "@/lib/dates";
import { refreshNotifications } from "@/lib/notify";
import { plaidConfigured, TRIAL_ITEM_LIMIT } from "@/lib/plaid";
import { inferRecurringKind } from "@/lib/plan";
import { shelfColor } from "@/lib/palette";
import { previewRecurring } from "@/lib/recurring";
import { openAccount, openBudgetItem, openRecurrence, openTx } from "@/lib/secrets";

export const dynamic = "force-dynamic";

const DEFAULT_LAYOUT = ["netWorth", "cashFlow", "budget", "unreviewed", "recurring", "goals", "transactions", "investments"];

export async function GET() {
  try {
    const dek = await requireDek();
    const db = await getDb();
    const now = yearMonth();
    const monthRow = await getOrCreateBudgetMonth(now.year, now.month, dek);
    const spent = await spentByCategory(now.year, now.month, dek);
    const cats = await db.select().from(categories);
    const plannedRows = await db.select().from(budgetItems).where(eq(budgetItems.budgetMonthId, monthRow.id));
    const recent = await db.select().from(transactions).orderBy(desc(transactions.date)).limit(8);
    const recurringRows = await db.select().from(recurrences);
    const openedAccounts = await db.select().from(accounts);
    const income = await incomeInMonth(now.year, now.month, dek);
    const itemsPlaid = await db.select().from(plaidItems);
    const unreviewedRows = await db
      .select({ n: sql<number>`count(*)` })
      .from(transactions)
      .where(and(eq(transactions.reviewed, false), eq(transactions.hidden, false)));

    const expenseIds = new Set(cats.filter((cat) => cat.kind === "expense").map((cat) => cat.id));
    const planned = plannedRows
      .map((row) => openBudgetItem(row, dek))
      .filter((row) => expenseIds.has(row.categoryId))
      .reduce((sum, row) => sum + row.plannedCents + row.rolloverInCents, 0);
    const spentTotal = Object.entries(spent)
      .filter(([id]) => expenseIds.has(id))
      .reduce((sum, [, cents]) => sum + cents, 0);
    const accountsOpen = openedAccounts.map((row) => openAccount(row, dek));
    const latest = recent.map((row) => openTx(row, dek)).filter((tx) => !tx.hidden);
    const upcoming = recurringRows
      .map((row) => openRecurrence(row, dek))
      .filter((row) => row.isActive)
      .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
      .slice(0, 6);

    let suggestedSubscriptions: { merchantName: string; amountCents: number; cadence: string }[] = [];
    try {
      suggestedSubscriptions = (await previewRecurring(dek))
        .filter((draft) => inferRecurringKind(draft) === "subscription")
        .slice(0, 4)
        .map((draft) => ({ merchantName: draft.merchantName, amountCents: draft.amountCents, cadence: draft.cadence }));
    } catch {
      suggestedSubscriptions = [];
    }

    void refreshNotifications(dek).catch(() => undefined);

    const groupRows = await db.select().from(categoryGroups);
    const spending = Object.entries(spent)
      .map(([id, cents]) => {
        const category = cats.find((row) => row.id === id);
        const group = groupRows.find((row) => row.id === category?.groupId);
        return { id, name: category?.name ?? "Other", cents, color: shelfColor(group?.color) };
      })
      .filter((row) => row.cents > 0)
      .sort((a, b) => b.cents - a.cents);

    return NextResponse.json({
      cashFlow: { incomeCents: income, spendingCents: spentTotal, savedCents: income - spentTotal },
      spendSeries: await spendByDay(now.year, now.month, dek),
      spending,
      suggestedSubscriptions,
      accountCount: accountsOpen.filter((account) => !account.isHidden).length,
      budget: {
        plannedCents: planned,
        spentCents: spentTotal,
        remainingCents: planned - spentTotal,
      },
      unreviewed: { count: Number(unreviewedRows[0]?.n ?? 0) },
      recurring: upcoming,
      transactions: latest.slice(0, 5).map((tx) => {
        const category = cats.find((row) => row.id === tx.categoryId);
        const group = category ? groupRows.find((row) => row.id === category.groupId) : null;
        const account = accountsOpen.find((row) => row.id === tx.accountId);
        return {
          id: tx.id,
          name: tx.name,
          merchantName: tx.merchantName,
          amountCents: tx.amountCents,
          date: tx.date,
          pending: tx.pending,
          category: category ? { name: category.name, color: shelfColor(group?.color) } : null,
          accountName: account?.name ?? null,
        };
      }),
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
