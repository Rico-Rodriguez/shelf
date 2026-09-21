import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function fileSecret(name: string, bytes: number): string {
  const dir = path.join(process.cwd(), "data");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  const secret = randomBytes(bytes).toString("hex");
  writeFileSync(file, secret, { encoding: "utf8" });
  return secret;
}

export function sessionSecret(): string {
  const env = process.env.APP_SECRET;
  if (env && env.length >= 32) return env;
  if (process.env.NODE_ENV === "production" && process.env.RAILWAY_ENVIRONMENT) {
    throw new Error("APP_SECRET must be set in production (32+ characters).");
  }
  return fileSecret("app-secret", 32);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 64);
  const prev = Buffer.from(hash, "hex");
  if (next.length !== prev.length) return false;
  return timingSafeEqual(next, prev);
}

export const MIN_PASSWORD = 12;

function seal(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

function open(payload: string, key: Buffer): string {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return dec.toString("utf8");
}

export function createDek(): Buffer {
  return randomBytes(32);
}

export function wrapDek(dek: Buffer, password: string): { salt: string; wrapped: string } {
  const salt = randomBytes(16).toString("hex");
  const kek = scryptSync(password, salt, 32);
  return { salt, wrapped: seal(dek.toString("base64"), kek) };
}

export function unwrapDek(password: string, salt: string, wrapped: string): Buffer {
  const kek = scryptSync(password, salt, 32);
  return Buffer.from(open(wrapped, kek), "base64");
}

export function encryptSecret(plain: string, dek: Buffer): string {
  return seal(plain, dek);
}

export function decryptSecret(payload: string, dek: Buffer): string {
  return open(payload, dek);
}
