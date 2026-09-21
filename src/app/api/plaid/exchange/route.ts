import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { plaidItems } from "@/db/schema";
import { AuthError, requireDek } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { nid } from "@/lib/ids";
import { getPlaidClient, plaidConfigured, TRIAL_ITEM_LIMIT } from "@/lib/plaid";
import { sealText } from "@/lib/secrets";
import { syncItem } from "@/lib/sync";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const dek = await requireDek();
    if (!plaidConfigured()) {
      return NextResponse.json({ error: "Plaid is not configured." }, { status: 400 });
    }
    const body = (await request.json()) as {
      public_token: string;
      metadata?: { institution?: { institution_id?: string; name?: string } };
    };
    const db = await getDb();
    const existing = await db.select().from(plaidItems);
    if (existing.length >= TRIAL_ITEM_LIMIT) {
      return NextResponse.json(
        { error: `Trial plan allows ${TRIAL_ITEM_LIMIT} institution logins. Removing one does not free a slot.` },
        { status: 400 },
      );
    }
    const client = getPlaidClient();
    const exchanged = await client.itemPublicTokenExchange({ public_token: body.public_token });
    const id = nid();
    await db.insert(plaidItems).values({
      id,
      itemId: exchanged.data.item_id,
      accessTokenEnc: encryptSecret(exchanged.data.access_token, dek),
      institutionId: body.metadata?.institution?.institution_id,
      institutionName: sealText(body.metadata?.institution?.name ?? null, dek),
      status: "ok",
    });
    const sync = await syncItem(id, dek);
    return NextResponse.json({ ok: true, itemId: id, sync });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    const message = err instanceof Error ? err.message : "Plaid error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
