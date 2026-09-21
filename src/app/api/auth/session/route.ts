import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { googleConfigured, googleSessionOk } from "@/lib/google-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getDb();
  const existing = await db.select().from(users);
  const session = await getSession();
  const vaultOpen = Boolean(session.dek);
  return NextResponse.json({
    needsSetup: existing.length === 0,
    needsGoogle: googleConfigured() && !googleSessionOk(session),
    googleEmail: session.googleEmail ?? null,
    role: session.role ?? "owner",
    unlocked: Boolean(session.unlocked && vaultOpen && !session.pendingTotp && !session.pendingEnroll),
    needsEnroll: Boolean(session.pendingEnroll && vaultOpen),
    needsTotp: Boolean(session.pendingTotp && vaultOpen && !googleConfigured()),
  });
}
