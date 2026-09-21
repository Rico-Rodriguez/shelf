import { NextResponse } from "next/server";
import { AuthError, requireWriter } from "@/lib/auth";
import { syncAllItems, syncItem } from "@/lib/sync";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const dek = await requireWriter();
    const body = (await request.json().catch(() => ({}))) as { itemId?: string; pendingOnly?: boolean };
    const result = body.itemId ? await syncItem(body.itemId, dek) : await syncAllItems(dek, { pendingOnly: body.pendingOnly });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message === "forbidden" ? "You have view-only access." : "locked" }, { status: err.message === "forbidden" ? 403 : 401 });
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
