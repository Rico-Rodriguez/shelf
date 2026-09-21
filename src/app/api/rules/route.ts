import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { rules } from "@/db/schema";
import { AuthError, requireUnlocked } from "@/lib/auth";
import { nid } from "@/lib/ids";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUnlocked();
    const db = await getDb();
    const rows = await db.select().from(rules);
    return NextResponse.json({ rules: rows.sort((a, b) => a.priority - b.priority) });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    await requireUnlocked();
    const body = (await request.json()) as typeof rules.$inferInsert;
    const db = await getDb();
    const id = nid();
    await db.insert(rules).values({
      ...body,
      id,
      name: body.name || "Untitled rule",
    });
    return NextResponse.json({ id });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}
