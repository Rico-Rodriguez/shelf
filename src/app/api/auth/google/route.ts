import { NextResponse } from "next/server";
import { publicOrigin } from "@/lib/gate";
import { googleConfigured } from "@/lib/google-config";
import { appReturnUrl, googleAuthUrl, oauthOrigin, oauthToken, privateIpRedirect } from "@/lib/google";

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
  const requestUrl = new URL(request.url);
  const currentOrigin = publicOrigin(request);
  if (privateIpRedirect(currentOrigin)) {
    const aliased = new URL(requestUrl);
    const target = new URL(oauthOrigin(currentOrigin));
    aliased.protocol = target.protocol;
    aliased.host = target.host;
    return NextResponse.redirect(aliased);
  }
  const state = oauthToken();
  const verifier = oauthToken();
  const nonce = oauthToken();
  const mobile = requestUrl.searchParams.get("mobile") === "1";
  const redirectUri = `${oauthOrigin(currentOrigin)}/api/auth/google/callback`;
  const res = NextResponse.redirect(googleAuthUrl(redirectUri, state, nonce, verifier));
  res.cookies.set("shelf_oauth_state", state, cookieBase);
  res.cookies.set("shelf_oauth_verifier", verifier, cookieBase);
  res.cookies.set("shelf_oauth_nonce", nonce, cookieBase);
  if (mobile) {
    res.cookies.set("shelf_oauth_mobile", "1", cookieBase);
    res.cookies.set("shelf_oauth_return", appReturnUrl(requestUrl.searchParams.get("return")), cookieBase);
  }
  return res;
}
