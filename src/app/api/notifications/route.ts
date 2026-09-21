import { NextResponse } from "next/server";
import { desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { notifications } from "@/db/schema";
import { AuthError, requireUnlocked } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUnlocked();
    const db = await getDb();
    const rows = await db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(40);
    return NextResponse.json({
      notifications: rows,
      unread: rows.filter((row) => !row.readAt).length,
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    await requireUnlocked();
    const body = (await request.json()) as { id?: string; all?: boolean };
    const db = await getDb();
    const now = new Date();
    if (body.all) {
      await db.update(notifications).set({ readAt: now }).where(isNull(notifications.readAt));
    } else if (body.id) {
      await db.update(notifications).set({ readAt: now }).where(eq(notifications.id, body.id));
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}
