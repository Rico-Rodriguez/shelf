import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { categories, categoryGroups, netWorthSnapshots, transactions } from "@/db/schema";
import { AuthError, requireDek } from "@/lib/auth";
import { computeNetWorth } from "@/lib/networth";
import { monthRange, yearMonth } from "@/lib/dates";
import { openSnapshot, openTx } from "@/lib/secrets";

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
    const [txRows, cats, groups, snapRows, nw] = await Promise.all([
      db.select().from(transactions),
      db.select().from(categories),
      db.select().from(categoryGroups),
      db.select().from(netWorthSnapshots),
      computeNetWorth(dek),
    ]);
    const txs = txRows.map((row) => openTx(row, dek));
    const snaps = snapRows.map((row) => openSnapshot(row, dek));

    const incomeIds = new Set(cats.filter((c) => c.kind === "income").map((c) => c.id));
    const monthTx = txs.filter((t) => t.date >= start && t.date <= end && !t.hidden && !t.pending && !t.isTransfer);

    let income = 0;
    const groupSpend: Record<string, number> = {};
    const catSpend: Record<string, { id: string; name: string; group: string; cents: number; color: string }> = {};

    for (const tx of monthTx) {
      if (tx.categoryId && incomeIds.has(tx.categoryId) && tx.amountCents < 0) {
        income += Math.abs(tx.amountCents);
        continue;
      }
      if (tx.amountCents <= 0) continue;
      const cat = cats.find((c) => c.id === tx.categoryId);
      const group = groups.find((g) => g.id === cat?.groupId);
      const gName = group?.name ?? "Other";
      groupSpend[gName] = (groupSpend[gName] ?? 0) + tx.amountCents;
      const key = cat?.id ?? "uncat";
      catSpend[key] = catSpend[key] ?? {
        id: cat?.id ?? "",
        name: cat?.name ?? "Uncategorized",
        group: gName,
        cents: 0,
        color: group?.color ?? "#9A8B7A",
      };
      catSpend[key].cents += tx.amountCents;
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

    return NextResponse.json({
      year,
      month,
      incomeCents: income,
      spendingCents: Object.values(catSpend).reduce((s, r) => s + r.cents, 0),
      byCategory: Object.values(catSpend).sort((a, b) => b.cents - a.cents),
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
