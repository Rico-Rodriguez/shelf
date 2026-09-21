import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { tags } from "@/db/schema";
import { AuthError, requireDek, requireWriter } from "@/lib/auth";
import { nid } from "@/lib/ids";

export const dynamic = "force-dynamic";

function denied(err: unknown) {
  if (!(err instanceof AuthError)) return null;
  const forbidden = err.message === "forbidden";
  return NextResponse.json({ error: forbidden ? "You have view-only access." : "locked" }, { status: forbidden ? 403 : 401 });
}

export async function GET() {
  try {
    await requireDek();
    const db = await getDb();
    const rows = await db.select().from(tags);
    return NextResponse.json({ tags: rows.sort((a, b) => a.name.localeCompare(b.name)) });
  } catch (err) {
    const response = denied(err);
    if (response) return response;
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    await requireWriter();
    const body = (await request.json()) as { name: string; color?: string };
    const name = body.name?.trim();
    if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
    const db = await getDb();
    const id = nid();
    await db.insert(tags).values({ id, name, color: body.color ?? "#8a8175" });
    return NextResponse.json({ id });
  } catch (err) {
    const response = denied(err);
    if (response) return response;
    throw err;
  }
}

export async function PATCH(request: Request) {
  try {
    await requireWriter();
    const body = (await request.json()) as { id: string; name?: string; color?: string };
    const db = await getDb();
    await db
      .update(tags)
      .set({ name: body.name?.trim(), color: body.color })
      .where(eq(tags.id, body.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    const response = denied(err);
    if (response) return response;
    throw err;
  }
}

export async function DELETE(request: Request) {
  try {
    await requireWriter();
    const body = (await request.json()) as { id: string };
    const db = await getDb();
    await db.delete(tags).where(eq(tags.id, body.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    const response = denied(err);
    if (response) return response;
    throw err;
  }
}
