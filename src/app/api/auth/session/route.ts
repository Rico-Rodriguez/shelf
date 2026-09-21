import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getDb();
  const existing = await db.select().from(users);
  const session = await getSession();
  return NextResponse.json({
    needsSetup: existing.length === 0,
    unlocked: Boolean(session.unlocked),
  });
}
