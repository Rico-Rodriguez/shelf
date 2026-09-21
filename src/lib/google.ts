import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { allowedGoogleEmail, googleClientId, googleClientSecret } from "./google-config";

const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export function oauthToken(): string {
  return randomBytes(32).toString("base64url");
}

export function codeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function tokensMatch(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function googleAuthUrl(redirectUri: string, state: string, nonce: string, verifier: string): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", googleClientId());
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", codeChallenge(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("login_hint", allowedGoogleEmail());
  return url.toString();
}

export async function exchangeGoogleCode(code: string, redirectUri: string, verifier: string): Promise<string> {
  const body = new URLSearchParams({
    code,
    client_id: googleClientId(),
    client_secret: googleClientSecret(),
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: verifier,
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error("google token exchange failed");
  const json = (await res.json()) as { id_token?: string };
  if (!json.id_token) throw new Error("google token missing");
  return json.id_token;
}

export async function verifyGoogleIdToken(idToken: string, nonce: string): Promise<{ sub: string; email: string }> {
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: googleClientId(),
  });
  if (!tokensMatch(String(payload.nonce ?? ""), nonce)) throw new Error("google nonce mismatch");
  const email = String(payload.email ?? "").toLowerCase();
  const verified = payload.email_verified === true || payload.email_verified === "true";
  const sub = String(payload.sub ?? "");
  if (!verified || !email || !sub) throw new Error("google profile incomplete");
  if (email !== allowedGoogleEmail()) throw new Error("google email rejected");
  return { sub, email };
}
