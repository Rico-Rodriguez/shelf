import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { AuthError, requireUnlocked } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireUnlocked();
    const body = (await request.json()) as { current?: string; next?: string };
    if (!body.next || body.next.length < 8) {
      return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });
    }
    const db = await getDb();
    const [user] = await db.select().from(users);
    if (!user || !body.current || !verifyPassword(body.current, user.passwordHash)) {
      return NextResponse.json({ error: "Current password is wrong." }, { status: 400 });
    }
    await db.update(users).set({ passwordHash: hashPassword(body.next) }).where(eq(users.id, user.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}
