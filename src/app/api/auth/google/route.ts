import { NextResponse } from "next/server";
import { publicOrigin } from "@/lib/gate";
import { googleConfigured } from "@/lib/google-config";
import { googleAuthUrl, oauthToken } from "@/lib/google";

export const dynamic = "force-dynamic";

const cookieBase = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 600,
};

export async function GET(request: Request) {
  if (!googleConfigured()) return new NextResponse(null, { status: 404 });
  const state = oauthToken();
  const verifier = oauthToken();
  const nonce = oauthToken();
  const redirectUri = `${publicOrigin(request)}/api/auth/google/callback`;
  const res = NextResponse.redirect(googleAuthUrl(redirectUri, state, nonce, verifier));
  res.cookies.set("shelf_oauth_state", state, cookieBase);
  res.cookies.set("shelf_oauth_verifier", verifier, cookieBase);
  res.cookies.set("shelf_oauth_nonce", nonce, cookieBase);
  return res;
}
