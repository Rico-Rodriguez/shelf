import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, goalAccounts, goals, transactions } from "@/db/schema";
import { AuthError, requireUnlocked } from "@/lib/auth";
import { nid } from "@/lib/ids";
import { dollarsToCents } from "@/lib/money";
import { classifyAccount } from "@/lib/networth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUnlocked();
    const db = await getDb();
    const [goalRows, links, accts, txs] = await Promise.all([
      db.select().from(goals),
      db.select().from(goalAccounts),
      db.select().from(accounts),
      db.select().from(transactions),
    ]);
    const data = goalRows.map((g) => {
      const linked = links.filter((l) => l.goalId === g.id).map((l) => accts.find((a) => a.id === l.accountId)!).filter(Boolean);
      let progressCents = 0;
      if (g.kind === "save_up") {
        progressCents = linked.reduce((s, a) => s + (classifyAccount(a.type) === "asset" ? a.currentBalanceCents : 0), 0);
      } else {
        const owed = linked.reduce((s, a) => s + Math.abs(a.currentBalanceCents), 0);
        progressCents = Math.max(0, (g.targetCents || owed) - owed);
      }
      const linkedTx = txs.filter((t) => t.goalId === g.id);
      return {
        ...g,
        accounts: linked,
        progressCents,
        remainingCents: Math.max(0, g.targetCents - progressCents),
        transactions: linkedTx,
      };
    });
    return NextResponse.json({ goals: data, accounts: accts });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    await requireUnlocked();
    const body = (await request.json()) as {
      name: string;
      kind: "save_up" | "pay_down";
      target?: number;
      targetDate?: string;
      accountIds?: string[];
    };
    const db = await getDb();
    const id = nid();
    await db.insert(goals).values({
      id,
      name: body.name,
      kind: body.kind,
      targetCents: dollarsToCents(body.target ?? 0),
      targetDate: body.targetDate,
    });
    for (const accountId of body.accountIds ?? []) {
      await db.insert(goalAccounts).values({ goalId: id, accountId });
    }
    return NextResponse.json({ id });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}

export async function PATCH(request: Request) {
  try {
    await requireUnlocked();
    const body = (await request.json()) as {
      id: string;
      name?: string;
      target?: number;
      targetDate?: string | null;
      accountIds?: string[];
    };
    const db = await getDb();
    await db
      .update(goals)
      .set({
        name: body.name,
        targetCents: body.target == null ? undefined : dollarsToCents(body.target),
        targetDate: body.targetDate,
      })
      .where(eq(goals.id, body.id));
    if (body.accountIds) {
      await db.delete(goalAccounts).where(eq(goalAccounts.goalId, body.id));
      for (const accountId of body.accountIds) {
        await db.insert(goalAccounts).values({ goalId: body.id, accountId });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}

export async function DELETE(request: Request) {
  try {
    await requireUnlocked();
    const body = (await request.json()) as { id: string };
    const db = await getDb();
    await db.delete(goals).where(eq(goals.id, body.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}
