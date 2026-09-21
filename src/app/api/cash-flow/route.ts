import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { accounts, categories, categoryGroups, transactions } from "@/db/schema";
import { AuthError, requireUnlocked } from "@/lib/auth";
import { addMonths, monthKey, yearMonth } from "@/lib/dates";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireUnlocked();
    const url = new URL(request.url);
    const grain = url.searchParams.get("grain") ?? "month";
    const accountId = url.searchParams.get("accountId");
    const categoryId = url.searchParams.get("categoryId");
    const merchant = url.searchParams.get("merchant")?.toLowerCase();
    const months = Number(url.searchParams.get("months") ?? 12);
    const now = yearMonth();
    const db = await getDb();
    const [txs, cats, groups, accts] = await Promise.all([
      db.select().from(transactions),
      db.select().from(categories),
      db.select().from(categoryGroups),
      db.select().from(accounts),
    ]);
    const incomeIds = new Set(cats.filter((c) => c.kind === "income").map((c) => c.id));

    const buckets: Record<string, { income: number; spending: number; savings: number; key: string }> = {};
    const startFrom = addMonths(now.year, now.month, -(months - 1));

    for (let i = 0; i < months; i += 1) {
      const m = addMonths(startFrom.year, startFrom.month, i);
      const key = monthKey(m.year, m.month);
      buckets[key] = { income: 0, spending: 0, savings: 0, key };
    }

    const byCategory: Record<string, number> = {};
    const byMerchant: Record<string, number> = {};

    for (const tx of txs) {
      if (tx.hidden || tx.pending || tx.isTransfer) continue;
      if (accountId && tx.accountId !== accountId) continue;
      if (categoryId && tx.categoryId !== categoryId) continue;
      if (merchant && !(tx.merchantName ?? tx.name).toLowerCase().includes(merchant)) continue;
      const key = tx.date.slice(0, 7);
      if (!buckets[key]) continue;
      if (tx.categoryId && incomeIds.has(tx.categoryId) && tx.amountCents < 0) {
        buckets[key].income += Math.abs(tx.amountCents);
      } else if (tx.amountCents > 0) {
        buckets[key].spending += tx.amountCents;
        const catName = cats.find((c) => c.id === tx.categoryId)?.name ?? "Uncategorized";
        byCategory[catName] = (byCategory[catName] ?? 0) + tx.amountCents;
        const merch = tx.merchantName || tx.name;
        byMerchant[merch] = (byMerchant[merch] ?? 0) + tx.amountCents;
      }
    }

    for (const b of Object.values(buckets)) {
      b.savings = b.income - b.spending;
    }

    const series = Object.values(buckets).sort((a, b) => a.key.localeCompare(b.key));
    if (grain === "quarter") {
      const q: Record<string, { income: number; spending: number; savings: number; key: string }> = {};
      for (const s of series) {
        const [y, m] = s.key.split("-").map(Number);
        const qk = `${y}-Q${Math.ceil(m / 3)}`;
        q[qk] = q[qk] ?? { income: 0, spending: 0, savings: 0, key: qk };
        q[qk].income += s.income;
        q[qk].spending += s.spending;
        q[qk].savings += s.savings;
      }
      return NextResponse.json({
        series: Object.values(q),
        byCategory,
        byMerchant,
        accounts: accts,
        groups,
      });
    }

    return NextResponse.json({ series, byCategory, byMerchant, accounts: accts, groups });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}
