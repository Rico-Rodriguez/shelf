import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { categories, categoryGroups } from "@/db/schema";
import { AuthError, requireUnlocked, requireWriter } from "@/lib/auth";
import { nid } from "@/lib/ids";
import { shelfColor } from "@/lib/palette";

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
          color: shelfColor(g.color),
          categories: cats.filter((c) => c.groupId === g.id).sort((a, b) => a.sortOrder - b.sortOrder),
        })),
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message === "forbidden" ? "You have view-only access." : "locked" }, { status: err.message === "forbidden" ? 403 : 401 });
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    await requireWriter();
    const body = (await request.json()) as {
      entity?: "group" | "category";
      groupId?: string;
      name: string;
      kind?: string;
      color?: string;
      flexBucket?: string;
      rollover?: boolean;
      sprite?: string;
    };
    const db = await getDb();
    if (body.entity === "group") {
      const id = nid();
      await db.insert(categoryGroups).values({
        id,
        name: body.name,
        kind: body.kind ?? "expense",
        color: body.color ?? "#8a8175",
        sortOrder: 50,
      });
      return NextResponse.json({ id });
    }
    if (!body.groupId) return NextResponse.json({ error: "Group is required." }, { status: 400 });
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
    if (err instanceof AuthError) return NextResponse.json({ error: err.message === "forbidden" ? "You have view-only access." : "locked" }, { status: err.message === "forbidden" ? 403 : 401 });
    throw err;
  }
}

export async function PATCH(request: Request) {
  try {
    await requireWriter();
    const body = (await request.json()) as {
      entity?: "group" | "category";
      id: string;
      name?: string;
      color?: string;
      sortOrder?: number;
      flexBucket?: string | null;
      rollover?: boolean;
      groupId?: string;
      order?: { id: string; sortOrder: number; entity?: "group" | "category" }[];
    };
    const db = await getDb();
    if (body.order) {
      for (const item of body.order) {
        if (item.entity === "group") {
          await db.update(categoryGroups).set({ sortOrder: item.sortOrder }).where(eq(categoryGroups.id, item.id));
        } else {
          await db.update(categories).set({ sortOrder: item.sortOrder }).where(eq(categories.id, item.id));
        }
      }
      return NextResponse.json({ ok: true });
    }
    if (body.entity === "group") {
      await db
        .update(categoryGroups)
        .set({ name: body.name, color: body.color, sortOrder: body.sortOrder })
        .where(eq(categoryGroups.id, body.id));
      return NextResponse.json({ ok: true });
    }
    const patch: {
      name?: string;
      flexBucket?: string | null;
      rollover?: boolean;
      groupId?: string;
    } = {};
    if (body.name != null) patch.name = body.name;
    if (body.flexBucket !== undefined) patch.flexBucket = body.flexBucket;
    if (body.rollover !== undefined) patch.rollover = body.rollover;
    if (body.groupId != null) patch.groupId = body.groupId;
    await db.update(categories).set(patch).where(eq(categories.id, body.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message === "forbidden" ? "You have view-only access." : "locked" }, { status: err.message === "forbidden" ? 403 : 401 });
    throw err;
  }
}

export async function DELETE(request: Request) {
  try {
    await requireWriter();
    const body = (await request.json()) as { id: string; entity?: "group" | "category" };
    const db = await getDb();
    if (body.entity === "group") await db.delete(categoryGroups).where(eq(categoryGroups.id, body.id));
    else await db.delete(categories).where(eq(categories.id, body.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message === "forbidden" ? "You have view-only access." : "locked" }, { status: err.message === "forbidden" ? 403 : 401 });
    throw err;
  }
}
