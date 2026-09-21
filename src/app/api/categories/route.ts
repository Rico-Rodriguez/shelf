import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { categories, categoryGroups } from "@/db/schema";
import { AuthError, requireUnlocked } from "@/lib/auth";
import { nid } from "@/lib/ids";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUnlocked();
    const db = await getDb();
    const groups = await db.select().from(categoryGroups);
    const cats = await db.select().from(categories);
    return NextResponse.json({
      groups: groups
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((g) => ({
          ...g,
          categories: cats.filter((c) => c.groupId === g.id).sort((a, b) => a.sortOrder - b.sortOrder),
        })),
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    await requireUnlocked();
    const body = (await request.json()) as {
      groupId: string;
      name: string;
      kind?: string;
      flexBucket?: string;
      rollover?: boolean;
      sprite?: string;
    };
    const db = await getDb();
    const id = nid();
    const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + id.slice(0, 6);
    await db.insert(categories).values({
      id,
      groupId: body.groupId,
      name: body.name,
      slug,
      kind: body.kind ?? "expense",
      flexBucket: body.flexBucket,
      rollover: body.rollover ?? false,
      sprite: body.sprite ?? "box",
      sortOrder: 99,
    });
    return NextResponse.json({ id });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}

export async function PATCH(request: Request) {
  try {
    await requireUnlocked();
    const body = (await request.json()) as {
      id: string;
      name?: string;
      flexBucket?: string | null;
      rollover?: boolean;
      groupId?: string;
    };
    const db = await getDb();
    await db
      .update(categories)
      .set({
        name: body.name,
        flexBucket: body.flexBucket,
        rollover: body.rollover,
        groupId: body.groupId,
      })
      .where(eq(categories.id, body.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}
