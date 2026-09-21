import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { createDek, unwrapDek, wrapDek } from "./crypto";

export async function openOrCreateDek(
  user: { id: string; dekSalt: string | null; dekWrapped: string | null },
  password: string,
): Promise<Buffer> {
  if (user.dekSalt && user.dekWrapped) return unwrapDek(password, user.dekSalt, user.dekWrapped);
  const dek = createDek();
  const wrapped = wrapDek(dek, password);
  const db = await getDb();
  await db
    .update(users)
    .set({ dekSalt: wrapped.salt, dekWrapped: wrapped.wrapped })
    .where(eq(users.id, user.id));
  return dek;
}
