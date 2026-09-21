import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { password?: string };
  const db = await getDb();
  const [user] = await db.select().from(users);
  if (!user || !body.password || !verifyPassword(body.password, user.passwordHash)) {
    return NextResponse.json({ error: "That key does not fit." }, { status: 401 });
  }
  const session = await getSession();
  session.unlocked = true;
  await session.save();
  return NextResponse.json({ ok: true });
}
