import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { rules } from "@/db/schema";
import { AuthError, requireUnlocked } from "@/lib/auth";
import { applyRuleToExisting } from "@/lib/rules";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireUnlocked();
    const { id } = await context.params;
    const body = (await request.json()) as Partial<typeof rules.$inferInsert> & { applyExisting?: boolean };
    const db = await getDb();
    const { applyExisting, ...patch } = body;
    await db.update(rules).set(patch).where(eq(rules.id, id));
    let applied = 0;
    if (applyExisting) {
      const [rule] = await db.select().from(rules).where(eq(rules.id, id));
      if (rule) applied = await applyRuleToExisting(db, rule);
    }
    return NextResponse.json({ ok: true, applied });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireUnlocked();
    const { id } = await context.params;
    const db = await getDb();
    await db.delete(rules).where(eq(rules.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}
