import { cookies } from "next/headers";
import { getIronSession, type IronSession } from "iron-session";
import { sessionSecret } from "./crypto";
import { prepareVault } from "./secrets";

export type MemberRole = "owner" | "member" | "advisor";

export type SessionData = {
  unlocked: boolean;
  dek?: string;
  userId?: string;
  role?: MemberRole;
  pendingTotp?: boolean;
  pendingEnroll?: boolean;
  totpSetupSecret?: string;
  googleSub?: string;
  googleEmail?: string;
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
  if (!session.unlocked || !session.dek || session.pendingTotp || session.pendingEnroll) {
    throw new AuthError("locked");
  }
  return session;
}

export async function requireDek(): Promise<Buffer> {
  const session = await requireUnlocked();
  const dek = Buffer.from(session.dek!, "base64");
  await prepareVault(dek);
  return dek;
}

export async function requireWriter(): Promise<Buffer> {
  const session = await requireUnlocked();
  if (session.role === "advisor") throw new AuthError("forbidden");
  const dek = Buffer.from(session.dek!, "base64");
  await prepareVault(dek);
  return dek;
}

export async function requireOwner(): Promise<Buffer> {
  const session = await requireUnlocked();
  if (session.role && session.role !== "owner") throw new AuthError("forbidden");
  const dek = Buffer.from(session.dek!, "base64");
  await prepareVault(dek);
  return dek;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}
