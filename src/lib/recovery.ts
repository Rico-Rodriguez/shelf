import { createHash, randomBytes } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { recoveryCodes } from "@/db/schema";
import { nid } from "./ids";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRecoveryCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const bytes = randomBytes(10);
    let raw = "";
    for (let j = 0; j < 10; j += 1) raw += ALPHABET[bytes[j]! % ALPHABET.length];
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return codes;
}

export function hashRecoveryCode(code: string) {
  const norm = code.toUpperCase().replace(/[^A-Z2-9]/g, "");
  return createHash("sha256").update(norm).digest("hex");
}

export async function storeRecoveryCodes(userId: string, codes: string[]) {
  const db = await getDb();
  await db.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
  if (!codes.length) return;
  await db.insert(recoveryCodes).values(
    codes.map((code) => ({
      id: nid(),
      userId,
      codeHash: hashRecoveryCode(code),
    })),
  );
}

/** Returns true when the code matched an unused recovery code, and consumes it. */
export async function consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
  const norm = code.toUpperCase().replace(/[^A-Z2-9]/g, "");
  if (norm.length < 8) return false;
  const db = await getDb();
  const rows = await db
    .select()
    .from(recoveryCodes)
    .where(and(eq(recoveryCodes.userId, userId), isNull(recoveryCodes.usedAt)));
  const hash = hashRecoveryCode(code);
  const hit = rows.find((row) => row.codeHash === hash);
  if (!hit) return false;
  await db.update(recoveryCodes).set({ usedAt: new Date() }).where(eq(recoveryCodes.id, hit.id));
  return true;
}
