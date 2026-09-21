import { NextResponse } from "next/server";
import { AuthError, requireUnlocked } from "@/lib/auth";
import { syncAllItems, syncItem } from "@/lib/sync";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireUnlocked();
    const body = (await request.json().catch(() => ({}))) as { itemId?: string };
    const result = body.itemId ? await syncItem(body.itemId) : await syncAllItems();
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
