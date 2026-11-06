import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { transactions } from "@/db/schema";
import { AuthError, requireDek } from "@/lib/auth";
import { logoLookup, readLogoStore } from "@/lib/merchant-logos";
import { openTx } from "@/lib/secrets";

export const dynamic = "force-dynamic";

/** Merchant key -> logo URL, for every merchant Plaid gave a logo. */
export async function GET() {
  try {
    const dek = await requireDek();
    const db = await getDb();
    const store = await readLogoStore(dek);
    if (!Object.keys(store.logos).length) return NextResponse.json({ logos: {} });
    const txs = (await db.select().from(transactions)).map((row) => openTx(row, dek));
    return NextResponse.json({ logos: logoLookup(store.logos, txs) });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message === "forbidden" ? "You have view-only access." : "locked" }, { status: err.message === "forbidden" ? 403 : 401 });
    throw err;
  }
}
