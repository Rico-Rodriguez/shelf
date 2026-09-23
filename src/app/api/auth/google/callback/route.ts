import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { deviceTokenFor } from "@/lib/device-session";
import { getSession } from "@/lib/auth";
import { publicOrigin } from "@/lib/gate";
import { appReturnUrl, exchangeGoogleCode, oauthOrigin, tokensMatch, verifyGoogleIdToken } from "@/lib/google";
import { googleConfigured } from "@/lib/google-config";

export const dynamic = "force-dynamic";

function clearOauth(res: NextResponse) {
  const gone = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 0 };
  res.cookies.set("shelf_oauth_state", "", gone);
  res.cookies.set("shelf_oauth_verifier", "", gone);
  res.cookies.set("shelf_oauth_nonce", "", gone);
  res.cookies.set("shelf_oauth_mobile", "", gone);
  res.cookies.set("shelf_oauth_return", "", gone);
  return res;
}

export async function GET(request: Request) {
  const origin = publicOrigin(request);
  const cookie = request.headers.get("cookie") ?? "";
  const read = (name: string) =>
    cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`))
      ?.slice(name.length + 1);
  const mobileReturn = () => appReturnUrl(read("shelf_oauth_return"));
  const fail = (code: string) => {
    if (read("shelf_oauth_mobile") === "1") {
      const dest = new URL(mobileReturn());
      dest.searchParams.set("error", code);
      return clearOauth(NextResponse.redirect(dest));
    }
    return clearOauth(NextResponse.redirect(new URL(`/?google=${code}`, origin)));
  };
  if (!googleConfigured()) return new NextResponse(null, { status: 404 });

  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";

  if (!code || !tokensMatch(state, read("shelf_oauth_state"))) return fail("denied");
  const verifier = read("shelf_oauth_verifier");
  const nonce = read("shelf_oauth_nonce");
  if (!verifier || !nonce) return fail("denied");

  try {
    const redirectUri = `${oauthOrigin(origin)}/api/auth/google/callback`;
    const idToken = await exchangeGoogleCode(code, redirectUri, verifier);
    const profile = await verifyGoogleIdToken(idToken, nonce);
    const db = await getDb();
    const [user] = await db.select().from(users);
    if (user?.googleSub && user.googleSub !== profile.sub) return fail("mismatch");
    if (user && !user.googleSub) {
      await db
        .update(users)
        .set({ googleSub: profile.sub, googleEmail: profile.email })
        .where(eq(users.id, user.id));
    }
    const session = await getSession();
    session.googleSub = profile.sub;
    session.googleEmail = profile.email;
    session.unlocked = false;
    session.pendingTotp = false;
    session.pendingEnroll = false;
    session.dek = undefined;
    session.totpSetupSecret = undefined;
    await session.save();
    if (read("shelf_oauth_mobile") === "1") {
      const token = await deviceTokenFor(session);
      const dest = new URL(mobileReturn());
      dest.searchParams.set("token", token);
      dest.searchParams.set("next", user ? "login" : "setup");
      return clearOauth(NextResponse.redirect(dest));
    }
    return clearOauth(NextResponse.redirect(new URL("/", origin)));
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    return fail(message === "google email rejected" || message === "google profile incomplete" ? "mismatch" : "failed");
  }
}
