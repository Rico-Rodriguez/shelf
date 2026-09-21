import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { createDek, hashPassword, MIN_PASSWORD, wrapDek } from "@/lib/crypto";
import { nid } from "@/lib/ids";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { password?: string };
  if (!body.password || body.password.length < MIN_PASSWORD) {
    return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD} characters.` }, { status: 400 });
  }
  const db = await getDb();
  const existing = await db.select().from(users);
  if (existing.length > 0) {
    return NextResponse.json({ error: "Lock already exists." }, { status: 400 });
  }
  const dek = createDek();
  const wrapped = wrapDek(dek, body.password);
  await db.insert(users).values({
    id: nid(),
    passwordHash: hashPassword(body.password),
    dekSalt: wrapped.salt,
    dekWrapped: wrapped.wrapped,
    totpEnabled: false,
    failedAttempts: 0,
  });
  const session = await getSession();
  session.unlocked = false;
  session.pendingEnroll = true;
  session.pendingTotp = false;
  session.dek = dek.toString("base64");
  await session.save();
  return NextResponse.json({ ok: true, needEnroll: true });
}
