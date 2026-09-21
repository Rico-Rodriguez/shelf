import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { budgetItems, budgetMonths, categories, categoryGroups, settings } from "@/db/schema";
import { AuthError, requireDek } from "@/lib/auth";
import { getOrCreateBudgetMonth, incomeInMonth, spentByCategory, suggestBudget } from "@/lib/budget";
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
        };
      });

    const expensePlanned = rows.reduce((s, r) => s + r.availableCents, 0);
    const expenseSpent = rows.reduce((s, r) => s + r.spentCents, 0);
    const flex = {
      fixed: rows.filter((r) => r.category.flexBucket === "fixed"),
      non_monthly: rows.filter((r) => r.category.flexBucket === "non_monthly"),
      flex: rows.filter((r) => r.category.flexBucket === "flex" || !r.category.flexBucket),
    };

    return NextResponse.json({
      year,
      month,
      mode: cfg?.budgetMode ?? "category",
      plannedIncomeCents: monthRow.plannedIncomeCents,
      actualIncomeCents: actualIncome,
      leftoverCents: monthRow.plannedIncomeCents - expensePlanned,
      expensePlannedCents: expensePlanned,
      expenseSpentCents: expenseSpent,
      rows,
      flex,
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}

export async function PUT(request: Request) {
  try {
    const dek = await requireDek();
    const body = (await request.json()) as {
      year: number;
      month: number;
      plannedIncomeCents?: number;
      mode?: "category" | "flex";
      items?: { categoryId: string; plannedCents: number }[];
    };
    const db = await getDb();
    const monthRow = await getOrCreateBudgetMonth(body.year, body.month, dek);
    if (body.plannedIncomeCents != null) {
      await db
        .update(budgetMonths)
        .set(sealedBudgetMonthWrite(body.plannedIncomeCents, dek))
        .where(eq(budgetMonths.id, monthRow.id));
      await db.update(settings).set(sealedSettingsIncome(body.plannedIncomeCents, dek)).where(eq(settings.id, "default"));
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
            .set(sealedBudgetItemWrite(item.plannedCents, opened.rolloverInCents, dek))
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
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    const dek = await requireDek();
    const body = (await request.json()) as { year: number; month: number; apply?: boolean };
    const suggested = await suggestBudget(body.year, body.month, dek);
    if (body.apply) {
      const db = await getDb();
      const monthRow = await getOrCreateBudgetMonth(body.year, body.month, dek);
      await db
        .update(budgetMonths)
        .set(sealedBudgetMonthWrite(suggested.suggestedIncome, dek))
        .where(eq(budgetMonths.id, monthRow.id));
      for (const [categoryId, plannedCents] of Object.entries(suggested.suggested)) {
        const existing = await db.select().from(budgetItems);
        const found = existing.find((i) => i.budgetMonthId === monthRow.id && i.categoryId === categoryId);
        if (found) {
          const opened = openBudgetItem(found, dek);
          await db.update(budgetItems).set(sealedBudgetItemWrite(plannedCents, opened.rolloverInCents, dek)).where(eq(budgetItems.id, found.id));
        }
      }
    }
    return NextResponse.json(suggested);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}
