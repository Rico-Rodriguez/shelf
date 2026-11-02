import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts } from "@/db/schema";
import { classifyAccount } from "./money";
import { snapshotNetWorth } from "./networth";
import { openAccount, sealedAccountWrite } from "./secrets";

/** Apply a Plaid-signed amount to a manual account. Outflow (positive) lowers cash and raises debt. */
export async function applyManualAmount(
  accountId: string,
  amountCents: number,
  dek: Buffer,
  options?: { snapshot?: boolean },
) {
  if (!amountCents) return;
  const db = await getDb();
  const [row] = await db.select().from(accounts).where(eq(accounts.id, accountId));
  if (!row || row.plaidItemId) return;
  const account = openAccount(row, dek);
  const delta = classifyAccount(account.type) === "liability" ? amountCents : -amountCents;
  const available =
    account.availableBalanceCents == null ? null : account.availableBalanceCents + delta;
  await db
    .update(accounts)
    .set({
      ...sealedAccountWrite(
        {
          name: account.name,
          officialName: account.officialName,
          mask: account.mask,
          liabilityJson: account.liabilityJson,
          currentBalanceCents: account.currentBalanceCents + delta,
          availableBalanceCents: available,
        },
        dek,
      ),
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, accountId));
  if (options?.snapshot !== false) await snapshotNetWorth(dek);
}
