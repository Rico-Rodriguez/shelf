import { cookies } from "next/headers";
import { getIronSession, type IronSession } from "iron-session";
import { sessionSecret } from "./crypto";

export type SessionData = {
  unlocked: boolean;
};

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, {
    password: sessionSecret(),
    cookieName: "shelf_lock",
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  });
}

export async function requireUnlocked(): Promise<IronSession<SessionData>> {
  const session = await getSession();
  if (!session.unlocked) {
    throw new AuthError("locked");
  }
  return session;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}
