import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { publicOrigin } from "@/lib/gate";
import { exchangeGoogleCode, tokensMatch, verifyGoogleIdToken } from "@/lib/google";
import { googleConfigured } from "@/lib/google-config";

export const dynamic = "force-dynamic";

function clearOauth(res: NextResponse) {
  const gone = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 0 };
  res.cookies.set("shelf_oauth_state", "", gone);
  res.cookies.set("shelf_oauth_verifier", "", gone);
  res.cookies.set("shelf_oauth_nonce", "", gone);
  return res;
}

export async function GET(request: Request) {
  const origin = publicOrigin(request);
  const fail = (code: string) => clearOauth(NextResponse.redirect(new URL(`/login?google=${code}`, origin)));
  if (!googleConfigured()) return new NextResponse(null, { status: 404 });

  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const cookie = request.headers.get("cookie") ?? "";
  const read = (name: string) =>
    cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`))
      ?.slice(name.length + 1);

  if (!code || !tokensMatch(state, read("shelf_oauth_state"))) return fail("denied");
  const verifier = read("shelf_oauth_verifier");
  const nonce = read("shelf_oauth_nonce");
  if (!verifier || !nonce) return fail("denied");

  try {
    const redirectUri = `${origin}/api/auth/google/callback`;
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
    return clearOauth(NextResponse.redirect(new URL(user ? "/login" : "/setup", origin)));
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    return fail(message === "google email rejected" || message === "google profile incomplete" ? "mismatch" : "failed");
  }
}
