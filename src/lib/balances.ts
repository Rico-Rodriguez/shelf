import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accountBalanceSnapshots, accounts } from "@/db/schema";
import { todayISO } from "./dates";
import { nid } from "./ids";
import { openAccount, openBalanceSnapshot, sealedBalanceSnapshot } from "./secrets";

export async function recordBalances(dek: Buffer) {
  const db = await getDb();
  const date = todayISO();
  const rows = await db.select().from(accounts);
  for (const raw of rows) {
    const account = openAccount(raw, dek);
    const [existing] = await db
      .select()
      .from(accountBalanceSnapshots)
      .where(and(eq(accountBalanceSnapshots.accountId, account.id), eq(accountBalanceSnapshots.date, date)));
    const sealed = sealedBalanceSnapshot(account.currentBalanceCents, dek);
    if (existing) {
      await db.update(accountBalanceSnapshots).set(sealed).where(eq(accountBalanceSnapshots.id, existing.id));
    } else {
      await db.insert(accountBalanceSnapshots).values({
        id: nid(),
        accountId: account.id,
        date,
        ...sealed,
      });
    }
  }
}

export async function balancesForAccount(accountId: string, dek: Buffer) {
  const db = await getDb();
  const rows = await db.select().from(accountBalanceSnapshots).where(eq(accountBalanceSnapshots.accountId, accountId));
  return rows
    .map((row) => openBalanceSnapshot(row, dek))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({ date: row.date, balanceCents: row.balanceCents }));
}
