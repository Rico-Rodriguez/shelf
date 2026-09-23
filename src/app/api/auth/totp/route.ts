import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { AuthError, getSession, jsonWithDeviceToken } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { clearIpFailures, clientIp, ipBlocked, lockMessage, nextLock, noteIpFailure } from "@/lib/throttle";
import { verifyTotp } from "@/lib/totp";
import { prepareVault } from "@/lib/secrets";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (ipBlocked(ip)) {
    return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
  }
  try {
    const session = await getSession();
    if (!session.pendingTotp || !session.dek) throw new AuthError("locked");
    const body = (await request.json()) as { code?: string };
    const db = await getDb();
    const [user] = session.userId
      ? await db.select().from(users).where(eq(users.id, session.userId))
      : await db.select().from(users);
    if (!user?.totpSecretEnc || !user.totpEnabled) throw new AuthError("locked");
    const locked = lockMessage(user.lockedUntil);
    if (locked) return NextResponse.json({ error: locked }, { status: 429 });
    const secret = decryptSecret(user.totpSecretEnc, Buffer.from(session.dek, "base64"));
    if (!body.code || !verifyTotp(secret, body.code)) {
      noteIpFailure(ip);
      const next = nextLock(user.failedAttempts);
      await db.update(users).set(next).where(eq(users.id, user.id));
      if (next.lockedUntil) {
        session.pendingTotp = false;
        session.dek = undefined;
        await session.save();
      }
      return NextResponse.json(
        { error: next.lockedUntil ? "Too many attempts. Try again in 15 minutes." : "That code does not match." },
        { status: next.lockedUntil ? 429 : 401 },
      );
    }
    await db.update(users).set({ failedAttempts: 0, lockedUntil: null }).where(eq(users.id, user.id));
    clearIpFailures(ip);
    session.unlocked = true;
    session.pendingTotp = false;
    await session.save();
    await prepareVault(Buffer.from(session.dek, "base64"));
    return jsonWithDeviceToken(session, { ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}
