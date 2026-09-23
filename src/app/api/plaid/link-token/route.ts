import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { plaidItems } from "@/db/schema";
import { AuthError, requireDek } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { CountryCode } from "plaid";
import { getPlaidClient, linkProducts, plaidConfigured, plaidErrorMessage } from "@/lib/plaid";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const dek = await requireDek();
    if (!plaidConfigured()) {
      return NextResponse.json({ error: "Plaid is not configured." }, { status: 400 });
    }
    let itemId = "";
    let platform: "ios" | "android" = "ios";
    try {
      const body = (await request.json()) as { itemId?: string; platform?: string };
      itemId = body.itemId ?? "";
      if (body.platform === "android") platform = "android";
    } catch {
      itemId = "";
    }
    const client = getPlaidClient();
    const androidPackage = process.env.PLAID_ANDROID_PACKAGE || "app.shelf.mobile";
    const oauth =
      platform === "android"
        ? { android_package_name: androidPackage }
        : { redirect_uri: process.env.PLAID_REDIRECT_URI || undefined };
    if (itemId) {
      const db = await getDb();
      const [item] = await db.select().from(plaidItems).where(eq(plaidItems.id, itemId));
      if (!item) return NextResponse.json({ error: "That bank connection is missing." }, { status: 404 });
      const res = await client.linkTokenCreate({
        user: { client_user_id: "shelf-owner" },
        client_name: "Shelf",
        language: "en",
        access_token: decryptSecret(item.accessTokenEnc, dek),
        country_codes: [CountryCode.Us, CountryCode.Ca],
        webhook: process.env.PLAID_WEBHOOK_URL || undefined,
        ...oauth,
      });
      return NextResponse.json({ linkToken: res.data.link_token, update: true });
    }
    const products = linkProducts();
    const res = await client.linkTokenCreate({
      user: { client_user_id: "shelf-owner" },
      client_name: "Shelf",
      language: "en",
      webhook: process.env.PLAID_WEBHOOK_URL || undefined,
      ...oauth,
      ...products,
    });
    return NextResponse.json({ linkToken: res.data.link_token });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    const message = plaidErrorMessage(err);
    console.error("link-token failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
