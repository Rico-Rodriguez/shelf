import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { plaidItems } from "@/db/schema";
import { AuthError, requireWriter } from "@/lib/auth";
import { snapshotNetWorth } from "@/lib/networth";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const dek = await requireWriter();
    const { id } = await context.params;
    const db = await getDb();
    await db.delete(plaidItems).where(eq(plaidItems.id, id));
    await snapshotNetWorth(dek);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      const forbidden = err.message === "forbidden";
      return NextResponse.json({ error: forbidden ? "You have view-only access." : "locked" }, { status: forbidden ? 403 : 401 });
    }
    throw err;
  }
}
