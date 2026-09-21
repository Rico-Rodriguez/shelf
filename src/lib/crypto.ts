import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
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

export function encryptionKey(): Buffer {
  const env = process.env.APP_ENCRYPTION_KEY;
  const material = env && env.length >= 32 ? env : fileSecret("app-encryption-key", 32);
  return createHash("sha256").update(material).digest();
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

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptSecret(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return dec.toString("utf8");
}
