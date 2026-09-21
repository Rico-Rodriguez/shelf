import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { plaidItems } from "@/db/schema";
import { syncItem } from "@/lib/sync";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    webhook_type?: string;
    webhook_code?: string;
    item_id?: string;
  };
  if (!body.item_id) return NextResponse.json({ ok: true, ignored: true });
  const db = await getDb();
  const [item] = await db.select().from(plaidItems).where(eq(plaidItems.itemId, body.item_id));
  if (!item) return NextResponse.json({ ok: true, unknown: true });
  try {
    await syncItem(item.id);
  } catch (err) {
    console.error("webhook sync failed", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
