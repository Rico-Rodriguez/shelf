import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { AuthError, getSession } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { generateTotpSecret, totpUri, verifyTotp } from "@/lib/totp";
import { prepareVault } from "@/lib/secrets";

export const dynamic = "force-dynamic";

async function enrollSession() {
  const session = await getSession();
  if (!session.pendingEnroll || !session.dek) throw new AuthError("locked");
  return session;
}

export async function GET() {
  try {
    const session = await enrollSession();
    if (!session.totpSetupSecret) session.totpSetupSecret = generateTotpSecret();
    await session.save();
    const uri = totpUri(session.totpSetupSecret);
    const qr = await QRCode.toDataURL(uri, { margin: 1, width: 240 });
    return NextResponse.json({ qr, secret: session.totpSetupSecret });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    const session = await enrollSession();
    const body = (await request.json()) as { code?: string };
    if (!session.totpSetupSecret || !body.code || !verifyTotp(session.totpSetupSecret, body.code)) {
      return NextResponse.json({ error: "That code does not match." }, { status: 401 });
    }
    const dek = Buffer.from(session.dek!, "base64");
    const db = await getDb();
    const [user] = await db.select().from(users);
    if (!user) return NextResponse.json({ error: "locked" }, { status: 401 });
    await db
      .update(users)
      .set({ totpSecretEnc: encryptSecret(session.totpSetupSecret, dek), totpEnabled: true })
      .where(eq(users.id, user.id));
    session.unlocked = true;
    session.pendingEnroll = false;
    session.pendingTotp = false;
    session.totpSetupSecret = undefined;
    await session.save();
    await prepareVault(dek);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}
