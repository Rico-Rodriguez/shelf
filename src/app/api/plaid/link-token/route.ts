import { NextResponse } from "next/server";
import { AuthError, requireUnlocked } from "@/lib/auth";
import { getPlaidClient, linkProducts, plaidConfigured } from "@/lib/plaid";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await requireUnlocked();
    if (!plaidConfigured()) {
      return NextResponse.json({ error: "Plaid is not configured." }, { status: 400 });
    }
    const client = getPlaidClient();
    const products = linkProducts();
    const res = await client.linkTokenCreate({
      user: { client_user_id: "shelf-owner" },
      client_name: "Shelf",
      language: "en",
      webhook: process.env.PLAID_WEBHOOK_URL || undefined,
      redirect_uri: process.env.PLAID_REDIRECT_URI || undefined,
      ...products,
    });
    return NextResponse.json({ linkToken: res.data.link_token });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    const message = err instanceof Error ? err.message : "Plaid error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
