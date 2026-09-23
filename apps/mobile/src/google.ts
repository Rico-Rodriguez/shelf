import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { apiBase, setToken } from "./api";

WebBrowser.maybeCompleteAuthSession();

export async function signInWithGoogle(): Promise<"login" | "setup"> {
  const returnUrl = Linking.createURL("auth");
  const start = `${apiBase()}/api/auth/google?mobile=1&return=${encodeURIComponent(returnUrl)}`;
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
