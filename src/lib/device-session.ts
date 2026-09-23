import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { deviceSessions } from "@/db/schema";
import { decryptSecret, encryptSecret, sessionSecret } from "@/lib/crypto";
import { nid } from "@/lib/ids";
import type { SessionData } from "@/lib/auth";

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const bound = new WeakMap<object, { id: string; token: string }>();

function tokenKey(): Buffer {
  return createHash("sha256").update(sessionSecret()).digest();
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function snapshotSession(session: SessionData): SessionData {
  return {
    unlocked: Boolean(session.unlocked),
    dek: session.dek,
    userId: session.userId,
    role: session.role,
    pendingTotp: Boolean(session.pendingTotp),
    pendingEnroll: Boolean(session.pendingEnroll),
    totpSetupSecret: session.totpSetupSecret,
    googleSub: session.googleSub,
    googleEmail: session.googleEmail,
  };
}

function sealPayload(session: SessionData): string {
  return encryptSecret(JSON.stringify(snapshotSession(session)), tokenKey());
}

function openPayload(payload: string): SessionData | null {
  try {
    const parsed = JSON.parse(decryptSecret(payload, tokenKey())) as SessionData;
    if (typeof parsed !== "object" || parsed == null) return null;
    return snapshotSession(parsed);
  } catch {
    return null;
  }
}

export function bindDeviceSession(session: object, id: string, token: string) {
  bound.set(session, { id, token });
}

export async function findDeviceSession(token: string): Promise<{ id: string; data: SessionData } | null> {
  if (!token) return null;
  const db = await getDb();
  const [row] = await db.select().from(deviceSessions).where(eq(deviceSessions.tokenHash, hashToken(token)));
  if (!row || row.expiresAt.getTime() <= Date.now()) {
    if (row) await db.delete(deviceSessions).where(eq(deviceSessions.id, row.id));
    return null;
  }
  const data = openPayload(row.payload);
  if (!data) return null;
  return { id: row.id, data };
}

async function writeRow(id: string, token: string, session: SessionData) {
  const db = await getDb();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  const payload = sealPayload(session);
  const userId = session.userId ?? null;
  const existing = await db.select({ id: deviceSessions.id }).from(deviceSessions).where(eq(deviceSessions.id, id));
  if (existing.length) {
    await db.update(deviceSessions).set({ payload, userId, expiresAt }).where(eq(deviceSessions.id, id));
    return;
  }
  await db.insert(deviceSessions).values({
    id,
    tokenHash: hashToken(token),
    userId,
    payload,
    expiresAt,
  });
}

export async function deviceTokenFor(session: SessionData): Promise<string> {
  const known = bound.get(session);
  if (known) {
    await writeRow(known.id, known.token, session);
    return known.token;
  }
  const token = randomBytes(32).toString("base64url");
  const id = nid();
  await writeRow(id, token, session);
  bindDeviceSession(session, id, token);
  return token;
}

export async function revokeBoundSession(session: object) {
  const known = bound.get(session);
  if (!known) return;
  const db = await getDb();
  await db.delete(deviceSessions).where(eq(deviceSessions.id, known.id));
  bound.delete(session);
}
