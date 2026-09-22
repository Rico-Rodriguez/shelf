import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { accountBalanceSnapshots, accounts, holdings, securities, transactions } from "@/db/schema";
import { AuthError, requireDek } from "@/lib/auth";
import { openAccount, openBalanceSnapshot, openHolding, openSecurity, openTx } from "@/lib/secrets";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const dek = await requireDek();
    const db = await getDb();
    const [holds, secs, accts, txRows, snapRows] = await Promise.all([
      db.select().from(holdings),
      db.select().from(securities),
      db.select().from(accounts),
      db.select().from(transactions),
      db.select().from(accountBalanceSnapshots),
    ]);
    const openedHolds = holds.map((row) => openHolding(row, dek));
    const openedSecs = secs.map((row) => openSecurity(row, dek));
    const openedAccounts = accts.map((row) => openAccount(row, dek));
    const rows = openedHolds.map((h) => ({
      ...h,
      security: openedSecs.find((s) => s.id === h.securityId) ?? null,
      account: openedAccounts.find((a) => a.id === h.accountId) ?? null,
    }));
    const total = rows.reduce((s, r) => s + r.institutionValueCents, 0);
    const byType: Record<string, number> = {};
    for (const r of rows) {
      const t = r.security?.type ?? "other";
      byType[t] = (byType[t] ?? 0) + r.institutionValueCents;
    }
    const investIds = new Set(openedAccounts.filter((account) => account.type === "investment").map((account) => account.id));
    const txs = txRows.map((row) => openTx(row, dek));
    let contributionCents = 0;
    for (const tx of txs) {
      if (!investIds.has(tx.accountId) || tx.pending || tx.amountCents >= 0) continue;
      if (tx.isTransfer || tx.categoryId === "cat-invest") contributionCents += Math.abs(tx.amountCents);
    }
    const costBasisCents = rows.reduce((sum, row) => sum + (row.costBasisCents ?? 0), 0);
    const gainCents = rows.some((row) => row.costBasisCents != null) ? total - costBasisCents : null;
    const byDate = new Map<string, number>();
    for (const snap of snapRows.map((row) => openBalanceSnapshot(row, dek))) {
      if (!investIds.has(snap.accountId)) continue;
      byDate.set(snap.date, (byDate.get(snap.date) ?? 0) + snap.balanceCents);
    }
    const series = [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-36)
      .map(([date, cents]) => ({ date, cents }));
    return NextResponse.json({
      holdings: rows,
      totalCents: total,
      byType,
      contributionCents,
      gainCents,
      marketCents: gainCents ?? (contributionCents > 0 ? total - contributionCents : null),
      series,
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}
