import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { budgetItems, categories, categoryGroups, netWorthSnapshots, transactionSplits, transactions } from "@/db/schema";
import { AuthError, requireDek } from "@/lib/auth";
import { computeNetWorth } from "@/lib/networth";
import { addMonths, monthRange, yearMonth } from "@/lib/dates";
import { transactionParts } from "@/lib/spend";
import { getOrCreateBudgetMonth } from "@/lib/budget";
import { eq } from "drizzle-orm";
import { openBudgetItem, openSnapshot, openSplit, openTx } from "@/lib/secrets";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const dek = await requireDek();
    const url = new URL(request.url);
    const now = yearMonth();
    const year = Number(url.searchParams.get("year") ?? now.year);
    const month = Number(url.searchParams.get("month") ?? now.month);
    const { start, end } = monthRange(year, month);
    const db = await getDb();
    const [txRows, splitRows, cats, groups, snapRows, nw] = await Promise.all([
      db.select().from(transactions),
      db.select().from(transactionSplits),
      db.select().from(categories),
      db.select().from(categoryGroups),
      db.select().from(netWorthSnapshots),
      computeNetWorth(dek),
    ]);
    const txs = txRows.map((row) => openTx(row, dek));
    const splits = splitRows.map((row) => openSplit(row, dek));
    const snaps = snapRows.map((row) => openSnapshot(row, dek));

    const incomeIds = new Set(cats.filter((c) => c.kind === "income").map((c) => c.id));
    const monthTx = txs.filter((t) => t.date >= start && t.date <= end && !t.hidden && !t.pending && !t.isTransfer);

    let income = 0;
    const groupSpend: Record<string, number> = {};
    const catSpend: Record<string, { id: string; name: string; group: string; cents: number; color: string }> = {};

    for (const tx of monthTx) {
      for (const part of transactionParts(tx, splits)) {
        if (part.categoryId && incomeIds.has(part.categoryId) && part.amountCents < 0) {
          income += Math.abs(part.amountCents);
          continue;
        }
        if (part.amountCents <= 0) continue;
        const cat = cats.find((c) => c.id === part.categoryId);
        const group = groups.find((g) => g.id === cat?.groupId);
        const gName = group?.name ?? "Other";
        groupSpend[gName] = (groupSpend[gName] ?? 0) + part.amountCents;
        const key = cat?.id ?? "uncat";
        catSpend[key] = catSpend[key] ?? {
          id: cat?.id ?? "",
          name: cat?.name ?? "Uncategorized",
          group: gName,
          cents: 0,
          color: group?.color ?? "#9A8B7A",
        };
        catSpend[key].cents += part.amountCents;
      }
    }

    const nodes: { id: string; color: string }[] = [{ id: "Income", color: "#6B8F5E" }];
    const links: { source: string; target: string; value: number }[] = [];
    for (const [group, value] of Object.entries(groupSpend)) {
      nodes.push({ id: group, color: groups.find((g) => g.name === group)?.color ?? "#C4A484" });
      links.push({ source: "Income", target: group, value: value / 100 });
    }
    for (const row of Object.values(catSpend)) {
      if (!nodes.find((n) => n.id === row.name)) nodes.push({ id: row.name, color: row.color });
      links.push({ source: row.group, target: row.name, value: row.cents / 100 });
    }

    function spendBetween(rangeStart: string, rangeEnd: string) {
      const map: Record<string, number> = {};
      for (const tx of txs) {
        if (tx.date < rangeStart || tx.date > rangeEnd || tx.hidden || tx.pending || tx.isTransfer) continue;
        for (const part of transactionParts(tx, splits)) {
          if (part.amountCents <= 0) continue;
          if (part.categoryId && incomeIds.has(part.categoryId)) continue;
          const key = part.categoryId ?? "uncat";
          map[key] = (map[key] ?? 0) + part.amountCents;
        }
      }
      return map;
    }
    const prev = addMonths(year, month, -1);
    const prevRange = monthRange(prev.year, prev.month);
    const lastMap = spendBetween(prevRange.start, prevRange.end);
    const avgMap: Record<string, number> = {};
    for (const delta of [-1, -2, -3]) {
      const cursor = addMonths(year, month, delta);
      const range = monthRange(cursor.year, cursor.month);
      for (const [key, cents] of Object.entries(spendBetween(range.start, range.end))) {
        avgMap[key] = (avgMap[key] ?? 0) + cents;
      }
    }
    const budgetMonth = await getOrCreateBudgetMonth(year, month, dek);
    const plannedItems = (await db.select().from(budgetItems).where(eq(budgetItems.budgetMonthId, budgetMonth.id))).map((row) =>
      openBudgetItem(row, dek),
    );
    const plannedByCat = Object.fromEntries(plannedItems.map((item) => [item.categoryId, item.plannedCents + item.rolloverInCents]));
    const compared = Object.values(catSpend)
      .sort((a, b) => b.cents - a.cents)
      .map((row) => {
        const key = row.id || "uncat";
        return {
          ...row,
          lastCents: lastMap[key] ?? 0,
          avgCents: Math.round((avgMap[key] ?? 0) / 3),
          plannedCents: plannedByCat[row.id] ?? 0,
        };
      });

    return NextResponse.json({
      year,
      month,
      incomeCents: income,
      spendingCents: Object.values(catSpend).reduce((s, r) => s + r.cents, 0),
      byCategory: compared,
      byGroup: Object.entries(groupSpend).map(([name, cents]) => ({ name, cents })),
      sankey: { nodes, links },
      netWorth: nw,
      snapshots: snaps.sort((a, b) => a.date.localeCompare(b.date)),
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}
