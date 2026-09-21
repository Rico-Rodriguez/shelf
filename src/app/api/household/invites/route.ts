import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { householdInvites } from "@/db/schema";
import { AuthError, requireOwner } from "@/lib/auth";
import { hashPassword, wrapDek } from "@/lib/crypto";
import { ensureHousehold } from "@/lib/household";
import { nid } from "@/lib/ids";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const dek = await requireOwner();
    const body = (await request.json()) as { role?: "member" | "advisor" };
    const role = body.role === "advisor" ? "advisor" : "member";
    const householdId = await ensureHousehold();
    if (!householdId) return NextResponse.json({ error: "No household yet." }, { status: 400 });
    const code = randomBytes(9).toString("base64url");
    const wrapped = wrapDek(dek, code);
    const db = await getDb();
    const id = nid();
    await db.insert(householdInvites).values({
      id,
      householdId,
      role,
      codeHash: hashPassword(code),
      dekSalt: wrapped.salt,
      dekWrapped: wrapped.wrapped,
      expiresAt: new Date(Date.now() + 7 * 86400000),
    });
    return NextResponse.json({ id, code, role });
  } catch (err) {
    if (err instanceof AuthError) {
      const forbidden = err.message === "forbidden";
      return NextResponse.json({ error: forbidden ? "You have view-only access." : "locked" }, { status: forbidden ? 403 : 401 });
    }
    throw err;
  }
}
