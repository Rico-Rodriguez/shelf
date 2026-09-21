import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { accounts, holdings, securities } from "@/db/schema";
import { AuthError, requireDek } from "@/lib/auth";
import { openAccount, openHolding, openSecurity } from "@/lib/secrets";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const dek = await requireDek();
    const db = await getDb();
    const [holds, secs, accts] = await Promise.all([
      db.select().from(holdings),
      db.select().from(securities),
      db.select().from(accounts),
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
    return NextResponse.json({ holdings: rows, totalCents: total, byType });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}
