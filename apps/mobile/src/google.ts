import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { apiBase, setToken } from "./api";

WebBrowser.maybeCompleteAuthSession();

function lanOauthOrigin(): string | null {
  try {
    const url = new URL(apiBase());
    const parts = url.hostname.split(".").map((part) => Number(part));
    const privateIp =
      parts.length === 4 &&
      parts.every((part) => Number.isInteger(part)) &&
      (parts[0] === 10 || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31));
    if (!privateIp) return null;
    const port = url.port ? `:${url.port}` : "";
    return `http://${url.hostname}.nip.io${port}`;
  } catch {
    return null;
  }
}

export function googleRedirectHint(): string | null {
  const origin = lanOauthOrigin();
  return origin ? `${origin}/api/auth/google/callback` : null;
}

export async function signInWithGoogle(): Promise<"login" | "setup"> {
  const returnUrl = Linking.createURL("auth");
  const origin = lanOauthOrigin() ?? apiBase();
  const start = `${origin}/api/auth/google?mobile=1&return=${encodeURIComponent(returnUrl)}`;
  const result = await WebBrowser.openAuthSessionAsync(start, returnUrl);
  if (result.type !== "success") throw new Error("Google sign-in was cancelled.");
  const error = /[?&]error=([^&]+)/.exec(result.url)?.[1];
  if (error) throw new Error("Google sign-in failed.");
  const token = /[?&]token=([^&]+)/.exec(result.url)?.[1];
  const next = /[?&]next=([^&]+)/.exec(result.url)?.[1];
  if (!token) throw new Error("Google sign-in did not return a session.");
  await setToken(decodeURIComponent(token));
  return next === "setup" ? "setup" : "login";
}
