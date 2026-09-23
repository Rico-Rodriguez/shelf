import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionSecret } from "./crypto";
import { bindDeviceSession, deviceTokenFor, findDeviceSession, revokeBoundSession } from "./device-session";
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

export type ShelfSession = SessionData & {
  save: () => Promise<void>;
  destroy: () => void | Promise<void>;
};

function blankSession(): ShelfSession {
  return {
    unlocked: false,
    async save() {},
    destroy() {},
  };
}

function cookieOptions() {
  return {
    password: sessionSecret(),
    cookieName: "shelf_lock",
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
    },
  };
}

async function bearerSession(token: string): Promise<ShelfSession | null> {
  const loaded = await findDeviceSession(token);
  if (!loaded) return null;
  const session: ShelfSession = {
    ...loaded.data,
    async save() {
      await deviceTokenFor(session);
    },
    async destroy() {
      await revokeBoundSession(session);
      session.unlocked = false;
      session.dek = undefined;
      session.pendingEnroll = false;
      session.pendingTotp = false;
      session.totpSetupSecret = undefined;
    },
  };
  bindDeviceSession(session, loaded.id, token);
  return session;
}

export async function getSession(): Promise<ShelfSession> {
  const headerStore = await headers();
  const header = headerStore.get("authorization") ?? "";
  const token = /^Bearer\s+(\S+)/i.exec(header)?.[1];
  if (token) return (await bearerSession(token)) ?? blankSession();
  const cookieStore = await cookies();
  return (await getIronSession<SessionData>(cookieStore, cookieOptions())) as ShelfSession;
}

export async function requireUnlocked(): Promise<ShelfSession> {
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

export async function jsonWithDeviceToken(session: ShelfSession, body: Record<string, unknown>, status = 200) {
  const token = await deviceTokenFor(session);
  return NextResponse.json({ ...body, token }, { status });
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}
