import { withAuth } from "@/lib/api-guard";
import { getDb } from "@/db";
import { transactions } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withAuth(async () => {
    const db = await getDb();
    let ids: string[] | undefined;
    const text = await request.text();
    if (text) {
      const body = JSON.parse(text) as { ids?: unknown };
      if (Array.isArray(body.ids)) ids = body.ids.filter((id): id is string => typeof id === "string" && id.length > 0);
    }
    if (ids) {
      if (ids.length) {
        await db.update(transactions).set({ reviewed: true, updatedAt: new Date() }).where(inArray(transactions.id, ids));
      }
    } else {
      await db.update(transactions).set({ reviewed: true, updatedAt: new Date() }).where(eq(transactions.reviewed, false));
    }
    return { ok: true };
  });
}
