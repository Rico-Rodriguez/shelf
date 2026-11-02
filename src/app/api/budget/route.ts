import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { budgetItems, budgetMonths, categories, categoryGroups, settings } from "@/db/schema";
import { AuthError, requireDek, requireWriter } from "@/lib/auth";
import { getOrCreateBudgetMonth, incomeInMonth, pendingOutflow, spendByDay, spentByCategory, suggestBudget, trailingCategoryAverage } from "@/lib/budget";
import { yearMonth } from "@/lib/dates";
import { nid } from "@/lib/ids";
import { openBudgetItem, openSettings, sealedBudgetItemWrite, sealedBudgetMonthWrite, sealedSettingsIncome } from "@/lib/secrets";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const dek = await requireDek();
    const url = new URL(request.url);
    const now = yearMonth();
    const year = Number(url.searchParams.get("year") ?? now.year);
    const month = Number(url.searchParams.get("month") ?? now.month);
    const db = await getDb();
    const monthRow = await getOrCreateBudgetMonth(year, month, dek);
    const items = (await db.select().from(budgetItems).where(eq(budgetItems.budgetMonthId, monthRow.id))).map((row) =>
      openBudgetItem(row, dek),
    );
    const cats = await db.select().from(categories);
    const groups = await db.select().from(categoryGroups);
    const spent = await spentByCategory(year, month, dek);
    const actualIncome = await incomeInMonth(year, month, dek);
    const trail = await trailingCategoryAverage(year, month, dek);
    const pendingCents = await pendingOutflow(year, month, dek);
    const [cfgRow] = await db.select().from(settings);
    const cfg = cfgRow ? openSettings(cfgRow, dek) : null;

    const rows = cats
      .filter((c) => c.kind === "expense")
      .map((c) => {
        const item = items.find((i) => i.categoryId === c.id);
        const group = groups.find((g) => g.id === c.groupId);
        const planned = item?.plannedCents ?? 0;
        const rolloverIn = item?.rolloverInCents ?? 0;
        const used = spent[c.id] ?? 0;
        return {
          category: c,
          group,
          plannedCents: planned,
          rolloverInCents: rolloverIn,
          availableCents: planned + rolloverIn,
          spentCents: used,
          remainingCents: planned + rolloverIn - used,
          usualCents: trail.total == null ? null : (trail.byCategory[c.id] ?? 0),
        };
      });

    const flex = {
      fixed: rows.filter((r) => r.category.flexBucket === "fixed"),
      non_monthly: rows.filter((r) => r.category.flexBucket === "non_monthly"),
      flex: rows.filter((r) => r.category.flexBucket === "flex" || !r.category.flexBucket),
    };
    const mode = cfg?.budgetMode ?? "category";
    const flexPoolCents = monthRow.flexPoolCents ?? 0;
    const flexSpent = flex.flex.reduce((s, r) => s + r.spentCents, 0);
    const bucketPlanned = (list: typeof rows) => list.reduce((s, r) => s + r.availableCents, 0);
    const expensePlanned =
      mode === "flex"
        ? bucketPlanned(flex.fixed) + bucketPlanned(flex.non_monthly) + flexPoolCents
        : rows.reduce((s, r) => s + r.availableCents, 0);
    const expenseSpent = rows.reduce((s, r) => s + r.spentCents, 0);

    return NextResponse.json({
      year,
      month,
      mode,
      plannedIncomeCents: monthRow.plannedIncomeCents,
      flexPoolCents,
      flexSpentCents: flexSpent,
      flexRemainingCents: flexPoolCents - flexSpent,
      actualIncomeCents: actualIncome,
      leftoverCents: monthRow.plannedIncomeCents - expensePlanned,
      expensePlannedCents: expensePlanned,
      expenseSpentCents: expenseSpent,
      pendingCents,
      usualSpentCents: trail.total,
      spendSeries: await spendByDay(year, month, dek),
      rows,
      flex,
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message === "forbidden" ? "You have view-only access." : "locked" }, { status: err.message === "forbidden" ? 403 : 401 });
    throw err;
  }
}

export async function PUT(request: Request) {
  try {
    const dek = await requireWriter();
    const body = (await request.json()) as {
      year: number;
      month: number;
      plannedIncomeCents?: number;
      flexPoolCents?: number;
      mode?: "category" | "flex";
      items?: { categoryId: string; plannedCents: number }[];
      move?: { fromCategoryId: string; toCategoryId: string; cents: number };
    };
    const db = await getDb();
    const monthRow = await getOrCreateBudgetMonth(body.year, body.month, dek);
    if (body.plannedIncomeCents != null || body.flexPoolCents != null) {
      const income = body.plannedIncomeCents ?? monthRow.plannedIncomeCents;
      const flexPool = body.flexPoolCents ?? monthRow.flexPoolCents ?? 0;
      await db
        .update(budgetMonths)
        .set({ ...sealedBudgetMonthWrite(income, dek, flexPool), isSample: false })
        .where(eq(budgetMonths.id, monthRow.id));
      if (body.plannedIncomeCents != null) {
        await db.update(settings).set(sealedSettingsIncome(body.plannedIncomeCents, dek)).where(eq(settings.id, "default"));
      }
    }
    if (body.mode) {
      await db.update(settings).set({ budgetMode: body.mode }).where(eq(settings.id, "default"));
    }
    if (body.items) {
      for (const item of body.items) {
        const existing = await db.select().from(budgetItems);
        const found = existing.find((i) => i.budgetMonthId === monthRow.id && i.categoryId === item.categoryId);
        if (found) {
          const opened = openBudgetItem(found, dek);
          await db
            .update(budgetItems)
            .set({ ...sealedBudgetItemWrite(item.plannedCents, opened.rolloverInCents, dek), isSample: false })
            .where(eq(budgetItems.id, found.id));
        } else {
          await db.insert(budgetItems).values({
            id: nid(),
            budgetMonthId: monthRow.id,
            categoryId: item.categoryId,
            ...sealedBudgetItemWrite(item.plannedCents, 0, dek),
          });
        }
      }
    }
    if (body.move && body.move.cents > 0 && body.move.fromCategoryId !== body.move.toCategoryId) {
      const existing = await db.select().from(budgetItems);
      const from = existing.find((item) => item.budgetMonthId === monthRow.id && item.categoryId === body.move!.fromCategoryId);
      const to = existing.find((item) => item.budgetMonthId === monthRow.id && item.categoryId === body.move!.toCategoryId);
      if (from) {
        const openedFrom = openBudgetItem(from, dek);
        const nextFrom = Math.max(0, openedFrom.plannedCents - body.move.cents);
        const moved = openedFrom.plannedCents - nextFrom;
        await db.update(budgetItems).set({ ...sealedBudgetItemWrite(nextFrom, openedFrom.rolloverInCents, dek), isSample: false }).where(eq(budgetItems.id, from.id));
        if (moved > 0 && to) {
          const openedTo = openBudgetItem(to, dek);
          await db
            .update(budgetItems)
            .set({ ...sealedBudgetItemWrite(openedTo.plannedCents + moved, openedTo.rolloverInCents, dek), isSample: false })
            .where(eq(budgetItems.id, to.id));
        } else if (moved > 0) {
          await db.insert(budgetItems).values({
            id: nid(),
            budgetMonthId: monthRow.id,
            categoryId: body.move.toCategoryId,
            ...sealedBudgetItemWrite(moved, 0, dek),
          });
        }
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message === "forbidden" ? "You have view-only access." : "locked" }, { status: err.message === "forbidden" ? 403 : 401 });
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    const dek = await requireWriter();
    const body = (await request.json()) as { year: number; month: number; apply?: boolean };
    const suggested = await suggestBudget(body.year, body.month, dek);
    if (body.apply) {
      const db = await getDb();
      const monthRow = await getOrCreateBudgetMonth(body.year, body.month, dek);
      const cats = await db.select().from(categories);
      const flexIds = new Set(cats.filter((cat) => cat.flexBucket === "flex" || !cat.flexBucket).filter((cat) => cat.kind === "expense").map((cat) => cat.id));
      let flexPool = monthRow.flexPoolCents ?? 0;
      if (flexIds.size) {
        flexPool = Object.entries(suggested.suggested)
          .filter(([categoryId]) => flexIds.has(categoryId))
          .reduce((sum, [, cents]) => sum + cents, 0);
      }
      await db
        .update(budgetMonths)
        .set({ ...sealedBudgetMonthWrite(suggested.suggestedIncome, dek, flexPool), isSample: false })
        .where(eq(budgetMonths.id, monthRow.id));
      const existing = await db.select().from(budgetItems);
      for (const [categoryId, plannedCents] of Object.entries(suggested.suggested)) {
        const found = existing.find((i) => i.budgetMonthId === monthRow.id && i.categoryId === categoryId);
        if (found) {
          const opened = openBudgetItem(found, dek);
          await db.update(budgetItems).set({ ...sealedBudgetItemWrite(plannedCents, opened.rolloverInCents, dek), isSample: false }).where(eq(budgetItems.id, found.id));
        } else {
          await db.insert(budgetItems).values({
            id: nid(),
            budgetMonthId: monthRow.id,
            categoryId,
            ...sealedBudgetItemWrite(plannedCents, 0, dek),
          });
        }
      }
    }
    return NextResponse.json(suggested);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message === "forbidden" ? "You have view-only access." : "locked" }, { status: err.message === "forbidden" ? 403 : 401 });
    throw err;
  }
}
