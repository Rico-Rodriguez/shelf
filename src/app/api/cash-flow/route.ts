import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { accounts, categories, categoryGroups, transactions } from "@/db/schema";
import { AuthError, requireDek } from "@/lib/auth";
import { addMonths, monthKey, yearMonth } from "@/lib/dates";
import { openAccount, openTx } from "@/lib/secrets";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const dek = await requireDek();
    const url = new URL(request.url);
    const grain = url.searchParams.get("grain") ?? "month";
    const accountId = url.searchParams.get("accountId");
    const categoryId = url.searchParams.get("categoryId");
    const merchant = url.searchParams.get("merchant")?.toLowerCase();
    const months = Number(url.searchParams.get("months") ?? 12);
    const now = yearMonth();
    const db = await getDb();
    const [txRows, cats, groups, acctRows] = await Promise.all([
      db.select().from(transactions),
      db.select().from(categories),
      db.select().from(categoryGroups),
      db.select().from(accounts),
    ]);
    const txs = txRows.map((row) => openTx(row, dek));
    const accts = acctRows.map((row) => openAccount(row, dek));
    const incomeIds = new Set(cats.filter((c) => c.kind === "income").map((c) => c.id));

    const buckets: Record<string, { income: number; spending: number; savings: number; key: string }> = {};
    const startFrom = addMonths(now.year, now.month, -(months - 1));

    for (let i = 0; i < months; i += 1) {
      const m = addMonths(startFrom.year, startFrom.month, i);
      const key = monthKey(m.year, m.month);
      buckets[key] = { income: 0, spending: 0, savings: 0, key };
    }

    const byCategory = new Map<string, { id: string; name: string; cents: number }>();
    const byMerchant = new Map<string, { name: string; cents: number }>();

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
        const cat = cats.find((c) => c.id === tx.categoryId);
        const catKey = cat?.id ?? "uncat";
        const catRow = byCategory.get(catKey) ?? { id: cat?.id ?? "", name: cat?.name ?? "Uncategorized", cents: 0 };
        catRow.cents += tx.amountCents;
        byCategory.set(catKey, catRow);
        const merch = tx.merchantName || tx.name;
        const merchRow = byMerchant.get(merch) ?? { name: merch, cents: 0 };
        merchRow.cents += tx.amountCents;
        byMerchant.set(merch, merchRow);
      }
    }

    for (const b of Object.values(buckets)) {
      b.savings = b.income - b.spending;
    }

    const series = Object.values(buckets).sort((a, b) => a.key.localeCompare(b.key));
    const categoryRows = [...byCategory.values()].sort((a, b) => b.cents - a.cents);
    const merchantRows = [...byMerchant.values()].sort((a, b) => b.cents - a.cents);
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
        series: Object.values(q).sort((a, b) => a.key.localeCompare(b.key)),
        byCategory: categoryRows,
        byMerchant: merchantRows,
        accounts: accts,
        groups,
      });
    }

    return NextResponse.json({ series, byCategory: categoryRows, byMerchant: merchantRows, accounts: accts, groups });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}
