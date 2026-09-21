import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, goalAccounts, goals, transactions } from "@/db/schema";
import { AuthError, requireDek, requireWriter } from "@/lib/auth";
import { nid } from "@/lib/ids";
import { dollarsToCents } from "@/lib/money";
import { classifyAccount } from "@/lib/networth";
import { openAccount, openGoal, openTx, sealedGoalWrite } from "@/lib/secrets";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const dek = await requireDek();
    const db = await getDb();
    const [goalRows, links, accts, txs] = await Promise.all([
      db.select().from(goals),
      db.select().from(goalAccounts),
      db.select().from(accounts),
      db.select().from(transactions),
    ]);
    const openedGoals = goalRows.map((row) => openGoal(row, dek));
    const openedAccounts = accts.map((row) => openAccount(row, dek));
    const openedTxs = txs.map((row) => openTx(row, dek));
    const data = openedGoals.map((g) => {
      const linked = links.filter((l) => l.goalId === g.id).map((l) => openedAccounts.find((a) => a.id === l.accountId)!).filter(Boolean);
      let progressCents = 0;
      if (g.kind === "save_up") {
        progressCents = linked.reduce((s, a) => s + (classifyAccount(a.type) === "asset" ? a.currentBalanceCents : 0), 0);
      } else {
        const owed = linked.reduce((s, a) => s + Math.abs(a.currentBalanceCents), 0);
        const paid = openedTxs
          .filter((t) => t.goalId === g.id && t.amountCents > 0 && !t.pending)
          .reduce((s, t) => s + t.amountCents, 0);
        progressCents = g.targetCents > 0 ? Math.max(0, g.targetCents - owed) : paid;
      }
      const linkedTx = openedTxs.filter((t) => t.goalId === g.id);
      const owed = linked.reduce((s, a) => s + Math.abs(a.currentBalanceCents), 0);
      const remainingCents = g.kind === "pay_down" ? owed : Math.max(0, g.targetCents - progressCents);
      return {
        ...g,
        accounts: linked,
        progressCents,
        remainingCents,
        transactions: linkedTx,
      };
    });
    return NextResponse.json({ goals: data, accounts: openedAccounts });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message === "forbidden" ? "You have view-only access." : "locked" }, { status: err.message === "forbidden" ? 403 : 401 });
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    const dek = await requireWriter();
    const body = (await request.json()) as {
      name: string;
      kind: "save_up" | "pay_down";
      target?: number;
      targetDate?: string;
      accountIds?: string[];
    };
    const db = await getDb();
    const id = nid();
    const targetCents = dollarsToCents(body.target ?? 0);
    await db.insert(goals).values({
      id,
      kind: body.kind,
      targetDate: body.targetDate,
      ...sealedGoalWrite({ name: body.name, targetCents }, dek),
    });
    for (const accountId of body.accountIds ?? []) {
      await db.insert(goalAccounts).values({ goalId: id, accountId });
    }
    return NextResponse.json({ id });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message === "forbidden" ? "You have view-only access." : "locked" }, { status: err.message === "forbidden" ? 403 : 401 });
    throw err;
  }
}

export async function PATCH(request: Request) {
  try {
    const dek = await requireWriter();
    const body = (await request.json()) as {
      id: string;
      name?: string;
      kind?: "save_up" | "pay_down";
      target?: number;
      targetDate?: string | null;
      accountIds?: string[];
    };
    const db = await getDb();
    const [existing] = await db.select().from(goals).where(eq(goals.id, body.id));
    if (!existing) return NextResponse.json({ error: "missing" }, { status: 404 });
    const opened = openGoal(existing, dek);
    const patch: Record<string, unknown> = {};
    if (body.name != null || body.target != null) {
      Object.assign(
        patch,
        sealedGoalWrite(
          {
            name: body.name ?? opened.name,
            targetCents: body.target == null ? opened.targetCents : dollarsToCents(body.target),
          },
          dek,
        ),
      );
    }
    if (body.targetDate !== undefined) patch.targetDate = body.targetDate;
    if (body.kind) patch.kind = body.kind;
    if (Object.keys(patch).length) {
      await db.update(goals).set(patch).where(eq(goals.id, body.id));
    }
    if (body.accountIds) {
      await db.delete(goalAccounts).where(eq(goalAccounts.goalId, body.id));
      for (const accountId of body.accountIds) {
        await db.insert(goalAccounts).values({ goalId: body.id, accountId });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message === "forbidden" ? "You have view-only access." : "locked" }, { status: err.message === "forbidden" ? 403 : 401 });
    throw err;
  }
}

export async function DELETE(request: Request) {
  try {
    await requireWriter();
    const body = (await request.json()) as { id: string };
    const db = await getDb();
    await db.delete(goals).where(eq(goals.id, body.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message === "forbidden" ? "You have view-only access." : "locked" }, { status: err.message === "forbidden" ? 403 : 401 });
    throw err;
  }
}
