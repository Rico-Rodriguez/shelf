import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { hashPassword } from "@/lib/crypto";
import { nid } from "@/lib/ids";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { password?: string };
  if (!body.password || body.password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }
  const db = await getDb();
  const existing = await db.select().from(users);
  if (existing.length > 0) {
    return NextResponse.json({ error: "Lock already exists." }, { status: 400 });
  }
  await db.insert(users).values({ id: nid(), passwordHash: hashPassword(body.password) });
  const session = await getSession();
  session.unlocked = true;
  await session.save();
  return NextResponse.json({ ok: true });
}
