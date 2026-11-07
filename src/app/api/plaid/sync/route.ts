import { NextResponse } from "next/server";
import { AuthError, requireWriter } from "@/lib/auth";
import { syncAllItems, syncItem } from "@/lib/sync";

export const dynamic = "force-dynamic";
// A sync with several banks can outrun the platform default of 10 to 15 seconds.
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const dek = await requireWriter();
    const body = (await request.json().catch(() => ({}))) as { itemId?: string; pendingOnly?: boolean; refresh?: boolean };
    if (body.itemId) return NextResponse.json({ ok: true, result: await syncItem(body.itemId, dek) });
    const result = await syncAllItems(dek, { pendingOnly: body.pendingOnly, refresh: body.refresh });
    const failed = result.filter((row) => !row.ok).length;
    return NextResponse.json({ ok: true, result, failed });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message === "forbidden" ? "You have view-only access." : "locked" }, { status: err.message === "forbidden" ? 403 : 401 });
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
