import { withAuth } from "@/lib/api-guard";
import { getDb } from "@/db";
import { transactions } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST() {
  return withAuth(async () => {
    const db = await getDb();
    await db.update(transactions).set({ reviewed: true, updatedAt: new Date() }).where(eq(transactions.reviewed, false));
    return { ok: true };
  });
}
