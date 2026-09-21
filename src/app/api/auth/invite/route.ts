import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { householdInvites, householdMembers, users } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { hashPassword, MIN_PASSWORD, unwrapDek, verifyPassword, wrapDek } from "@/lib/crypto";
import { nid } from "@/lib/ids";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { code?: string; password?: string; name?: string };
  const code = body.code?.trim();
  if (!code || !body.password || body.password.length < MIN_PASSWORD) {
    return NextResponse.json({ error: `Use the invite code and a password of at least ${MIN_PASSWORD} characters.` }, { status: 400 });
  }
  const db = await getDb();
  const invites = await db.select().from(householdInvites);
  const invite = invites.find((row) => row.expiresAt > new Date() && verifyPassword(code, row.codeHash));
  if (!invite) return NextResponse.json({ error: "That invite is no longer valid." }, { status: 400 });
  const dek = unwrapDek(code, invite.dekSalt, invite.dekWrapped);
  const wrapped = wrapDek(dek, body.password);
  const id = nid();
  await db.insert(users).values({
    id,
    passwordHash: hashPassword(body.password),
    dekSalt: wrapped.salt,
    dekWrapped: wrapped.wrapped,
    displayName: body.name?.trim() || "Member",
    totpEnabled: false,
    failedAttempts: 0,
  });
  await db.insert(householdMembers).values({ householdId: invite.householdId, userId: id, role: invite.role });
  await db.delete(householdInvites).where(eq(householdInvites.id, invite.id));
  const session = await getSession();
  session.userId = id;
  session.role = invite.role === "advisor" ? "advisor" : invite.role === "owner" ? "owner" : "member";
  session.unlocked = false;
  session.pendingEnroll = true;
  session.pendingTotp = false;
  session.dek = dek.toString("base64");
  await session.save();
  return NextResponse.json({ ok: true, needEnroll: true });
}
