import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, netWorthSnapshots } from "@/db/schema";
import { nid } from "./ids";
import { todayISO } from "./dates";
import { classifyAccount } from "./money";
import { openAccount, openSnapshot, sealedSnapshotWrite } from "./secrets";

export { classifyAccount };

export async function computeNetWorth(dek: Buffer) {
  const db = await getDb();
  const rows = await db.select().from(accounts);
  let assets = 0;
  let liabilities = 0;
  for (const raw of rows) {
    const row = openAccount(raw, dek);
    if (row.isHidden || !row.includeInNetWorth) continue;
    const kind = classifyAccount(row.type);
    if (kind === "liability") liabilities += Math.abs(row.currentBalanceCents);
    else assets += row.currentBalanceCents;
  }
  return { assetsCents: assets, liabilitiesCents: liabilities, netWorthCents: assets - liabilities };
}

export async function snapshotNetWorth(dek: Buffer) {
  const db = await getDb();
  const snap = await computeNetWorth(dek);
  const date = todayISO();
  const existing = await db.select().from(netWorthSnapshots);
  const found = existing.find((r) => openSnapshot(r, dek).date === date) ?? existing.find((r) => r.date === date);
  const sealed = sealedSnapshotWrite(snap, dek);
  if (found) {
    await db.update(netWorthSnapshots).set(sealed).where(eq(netWorthSnapshots.id, found.id));
  } else {
    await db.insert(netWorthSnapshots).values({ id: nid(), date, ...sealed });
  }
  return { date, ...snap };
}
