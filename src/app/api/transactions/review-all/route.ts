import { withAuth } from "@/lib/api-guard";
import { requireWriter } from "@/lib/auth";
import { getDb } from "@/db";
import { transactions } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withAuth(async () => {
    await requireWriter();
    const db = await getDb();
    let ids: string[] | undefined;
    let restore: { id: string; categoryId: string | null }[] | undefined;
    const text = await request.text();
    if (text) {
      const body = JSON.parse(text) as { ids?: unknown; restore?: unknown };
      if (Array.isArray(body.ids)) ids = body.ids.filter((id): id is string => typeof id === "string" && id.length > 0);
      if (Array.isArray(body.restore)) {
        restore = body.restore.flatMap((row) => {
          if (!row || typeof row !== "object") return [];
          const item = row as { id?: unknown; categoryId?: unknown };
          if (typeof item.id !== "string" || !item.id) return [];
          return [{ id: item.id, categoryId: typeof item.categoryId === "string" ? item.categoryId : null }];
        });
      }
    }
    if (restore) {
      for (const row of restore) {
        await db
          .update(transactions)
          .set({ reviewed: false, categoryId: row.categoryId, updatedAt: new Date() })
          .where(eq(transactions.id, row.id));
      }
      return { ok: true };
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
