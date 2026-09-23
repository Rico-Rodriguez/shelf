import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { AuthError, jsonWithDeviceToken, requireDek, requireUnlocked } from "@/lib/auth";
import { hashPassword, MIN_PASSWORD, verifyPassword, wrapDek } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await requireUnlocked();
    const dek = await requireDek();
    const body = (await request.json()) as { current?: string; next?: string };
    if (!body.next || body.next.length < MIN_PASSWORD) {
      return NextResponse.json({ error: `New password must be at least ${MIN_PASSWORD} characters.` }, { status: 400 });
    }
    const db = await getDb();
    const [user] = session.userId
      ? await db.select().from(users).where(eq(users.id, session.userId))
      : await db.select().from(users);
    if (!user || !body.current || !verifyPassword(body.current, user.passwordHash)) {
      return NextResponse.json({ error: "Current password is wrong." }, { status: 400 });
    }
    const wrapped = wrapDek(dek, body.next);
    await db
      .update(users)
      .set({ passwordHash: hashPassword(body.next), dekSalt: wrapped.salt, dekWrapped: wrapped.wrapped })
      .where(eq(users.id, user.id));
    session.dek = dek.toString("base64");
    await session.save();
    return jsonWithDeviceToken(session, { ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}
