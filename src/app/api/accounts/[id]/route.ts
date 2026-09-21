import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts } from "@/db/schema";
import { AuthError, requireDek } from "@/lib/auth";
import { dollarsToCents } from "@/lib/money";
import { snapshotNetWorth } from "@/lib/networth";
import { openAccount, sealedAccountWrite } from "@/lib/secrets";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const dek = await requireDek();
    const { id } = await context.params;
    const body = (await request.json()) as {
      name?: string;
      currentBalance?: number;
      isHidden?: boolean;
      includeInNetWorth?: boolean;
      liabilityJson?: string;
    };
    const db = await getDb();
    const [existing] = await db.select().from(accounts).where(eq(accounts.id, id));
    if (!existing) return NextResponse.json({ error: "missing" }, { status: 404 });
    const opened = openAccount(existing, dek);
    const sensitive = body.name != null || body.currentBalance != null || body.liabilityJson != null;
    await db
      .update(accounts)
      .set({
        ...(sensitive
          ? sealedAccountWrite(
              {
                name: body.name ?? opened.name,
                officialName: opened.officialName,
                mask: opened.mask,
                liabilityJson: body.liabilityJson ?? opened.liabilityJson,
                currentBalanceCents:
                  body.currentBalance == null ? opened.currentBalanceCents : dollarsToCents(body.currentBalance),
                availableBalanceCents: opened.availableBalanceCents,
              },
              dek,
            )
          : {}),
        isHidden: body.isHidden,
        includeInNetWorth: body.includeInNetWorth,
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, id));
    await snapshotNetWorth(dek);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const dek = await requireDek();
    const { id } = await context.params;
    const db = await getDb();
    await db.delete(accounts).where(eq(accounts.id, id));
    await snapshotNetWorth(dek);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}
