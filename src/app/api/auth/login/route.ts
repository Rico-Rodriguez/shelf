import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/crypto";
import { googleConfigured, googleSessionOk } from "@/lib/google-config";
import { clearIpFailures, clientIp, ipBlocked, lockMessage, nextLock, noteIpFailure } from "@/lib/throttle";
import { openOrCreateDek } from "@/lib/vault";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (ipBlocked(ip)) {
    return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
  }
  const body = (await request.json()) as { password?: string };
  const session = await getSession();
  if (googleConfigured() && !googleSessionOk(session)) {
    return NextResponse.json({ error: "Sign in with Google first." }, { status: 401 });
  }
  const db = await getDb();
  const [user] = await db.select().from(users);
  if (!user || !body.password) {
    noteIpFailure(ip);
    return NextResponse.json({ error: "That key does not fit." }, { status: 401 });
  }
  const locked = lockMessage(user.lockedUntil);
  if (locked) return NextResponse.json({ error: locked }, { status: 429 });
  if (!verifyPassword(body.password, user.passwordHash)) {
    noteIpFailure(ip);
    const next = nextLock(user.failedAttempts);
    await db.update(users).set(next).where(eq(users.id, user.id));
    if (next.lockedUntil) {
      return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
    }
    return NextResponse.json({ error: "That key does not fit." }, { status: 401 });
  }

  if (googleConfigured() && user.googleSub && user.googleSub !== session.googleSub) {
    return NextResponse.json({ error: "This Shelf is tied to a different Google account." }, { status: 401 });
  }
  const dek = await openOrCreateDek(user, body.password);
  await db.update(users).set({ failedAttempts: 0, lockedUntil: null }).where(eq(users.id, user.id));
  clearIpFailures(ip);

  session.dek = dek.toString("base64");
  session.unlocked = false;
  session.totpSetupSecret = undefined;
  if (googleConfigured() && session.googleSub) {
    if (!user.googleSub) {
      await db
        .update(users)
        .set({ googleSub: session.googleSub, googleEmail: session.googleEmail })
        .where(eq(users.id, user.id));
    }
    session.unlocked = true;
    session.pendingTotp = false;
    session.pendingEnroll = false;
    await session.save();
    return NextResponse.json({ ok: true });
  }
  if (user.totpEnabled) {
    session.pendingTotp = true;
    session.pendingEnroll = false;
    await session.save();
    return NextResponse.json({ ok: true, needTotp: true });
  }
  session.pendingEnroll = true;
  session.pendingTotp = false;
  await session.save();
  return NextResponse.json({ ok: true, needEnroll: true });
}
