import { createHash } from "node:crypto";
import { importJWK, jwtVerify, type JWK } from "jose";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { plaidItems } from "@/db/schema";
import { getPlaidClient, plaidConfigured } from "@/lib/plaid";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const raw = await request.text();
  const token = request.headers.get("plaid-verification");
  if (!token || !(await verifyPlaidWebhook(token, raw))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (() => {
    try {
      return JSON.parse(raw) as { item_id?: string };
    } catch {
      return {};
    }
  })();
  if (!body.item_id) return NextResponse.json({ ok: true, ignored: true });
  const db = await getDb();
  const [item] = await db.select().from(plaidItems).where(eq(plaidItems.itemId, body.item_id));
  if (!item) return NextResponse.json({ ok: true, unknown: true });
  await db
    .update(plaidItems)
    .set({ status: "pending_sync", updatedAt: new Date() })
    .where(eq(plaidItems.id, item.id));
  return NextResponse.json({ ok: true, queued: true });
}

async function verifyPlaidWebhook(token: string, rawBody: string): Promise<boolean> {
  if (!plaidConfigured()) return false;
  try {
    const header = JSON.parse(Buffer.from(token.split(".")[0] ?? "", "base64url").toString("utf8")) as { kid?: string };
    if (!header.kid) return false;
    const client = getPlaidClient();
    const keyRes = await client.webhookVerificationKeyGet({ key_id: header.kid });
    const key = await importJWK(keyRes.data.key as JWK, "ES256");
    const { payload } = await jwtVerify(token, key, { maxTokenAge: "5m" });
    const claimed = payload["request_body_sha256"];
    if (typeof claimed !== "string") return false;
    const actual = createHash("sha256").update(rawBody).digest("hex");
    return claimed === actual;
  } catch {
    return false;
  }
}
