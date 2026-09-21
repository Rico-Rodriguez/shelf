import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { accounts, transactions } from "@/db/schema";
import { AuthError, requireDek, requireWriter } from "@/lib/auth";
import { balancesForAccount } from "@/lib/balances";
import { summarizeLiability } from "@/lib/liability";
import { dollarsToCents } from "@/lib/money";
import { snapshotNetWorth } from "@/lib/networth";
import { openAccount, openTx, sealedAccountWrite } from "@/lib/secrets";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const dek = await requireDek();
    const { id } = await context.params;
    const db = await getDb();
    const [existing] = await db.select().from(accounts).where(eq(accounts.id, id));
    if (!existing) return NextResponse.json({ error: "missing" }, { status: 404 });
    const account = openAccount(existing, dek);
    const recent = (await db.select().from(transactions).where(eq(transactions.accountId, id)).orderBy(desc(transactions.date)).limit(12)).map(
      (row) => openTx(row, dek),
    );
    return NextResponse.json({
      account,
      snapshots: await balancesForAccount(id, dek),
      liability: summarizeLiability(account.liabilityJson),
      transactions: recent,
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message === "forbidden" ? "You have view-only access." : "locked" }, { status: err.message === "forbidden" ? 403 : 401 });
    throw err;
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const dek = await requireWriter();
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
    if (err instanceof AuthError) return NextResponse.json({ error: err.message === "forbidden" ? "You have view-only access." : "locked" }, { status: err.message === "forbidden" ? 403 : 401 });
    throw err;
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const dek = await requireWriter();
    const { id } = await context.params;
    const db = await getDb();
    await db.delete(accounts).where(eq(accounts.id, id));
    await snapshotNetWorth(dek);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message === "forbidden" ? "You have view-only access." : "locked" }, { status: err.message === "forbidden" ? 403 : 401 });
    throw err;
  }
}
