import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts } from "@/db/schema";
import { AuthError, requireUnlocked } from "@/lib/auth";
import { dollarsToCents } from "@/lib/money";
import { snapshotNetWorth } from "@/lib/networth";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireUnlocked();
    const { id } = await context.params;
    const body = (await request.json()) as {
      name?: string;
      currentBalance?: number;
      isHidden?: boolean;
      includeInNetWorth?: boolean;
      liabilityJson?: string;
    };
    const db = await getDb();
    await db
      .update(accounts)
      .set({
        name: body.name,
        currentBalanceCents: body.currentBalance == null ? undefined : dollarsToCents(body.currentBalance),
        isHidden: body.isHidden,
        includeInNetWorth: body.includeInNetWorth,
        liabilityJson: body.liabilityJson,
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, id));
    await snapshotNetWorth();
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireUnlocked();
    const { id } = await context.params;
    const db = await getDb();
    await db.delete(accounts).where(eq(accounts.id, id));
    await snapshotNetWorth();
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}
