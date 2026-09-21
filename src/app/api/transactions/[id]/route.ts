import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { tags, transactionSplits, transactionTags, transactions } from "@/db/schema";
import { AuthError, requireWriter } from "@/lib/auth";
import { nid } from "@/lib/ids";
import { dollarsToCents } from "@/lib/money";
import { openTx, sealedSplitWrite, sealedTxWrite } from "@/lib/secrets";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const dek = await requireWriter();
    const { id } = await context.params;
    const body = (await request.json()) as {
      name?: string;
      merchantName?: string;
      categoryId?: string | null;
      reviewed?: boolean;
      hidden?: boolean;
      notes?: string | null;
      goalId?: string | null;
      isTransfer?: boolean;
      transferPairId?: string | null;
      amount?: number;
      date?: string;
      tags?: string[];
      splits?: { categoryId: string; amountCents?: number; amount?: number; notes?: string }[];
    };
    const db = await getDb();
    const [existing] = await db.select().from(transactions).where(eq(transactions.id, id));
    if (!existing) return NextResponse.json({ error: "missing" }, { status: 404 });
    const opened = openTx(existing, dek);
    const sensitive = body.name != null || body.merchantName != null || body.notes !== undefined || body.amount != null;
    await db
      .update(transactions)
      .set({
        ...(sensitive
          ? sealedTxWrite(
              {
                name: body.name ?? opened.name,
                merchantName: body.merchantName ?? opened.merchantName,
                originalDescription: opened.originalDescription,
                notes: body.notes !== undefined ? body.notes : opened.notes,
                amountCents: body.amount == null ? opened.amountCents : dollarsToCents(body.amount),
              },
              dek,
            )
          : {}),
        categoryId: body.categoryId,
        reviewed: body.reviewed,
        hidden: body.hidden,
        goalId: body.goalId,
        isTransfer: body.transferPairId ? true : body.isTransfer,
        transferPairId: body.transferPairId,
        date: body.date,
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, id));

    if (body.transferPairId !== undefined) {
      if (opened.transferPairId && opened.transferPairId !== body.transferPairId) {
        await db.update(transactions).set({ transferPairId: null }).where(eq(transactions.id, opened.transferPairId));
      }
      if (body.transferPairId) {
        await db
          .update(transactions)
          .set({ transferPairId: id, isTransfer: true, updatedAt: new Date() })
          .where(eq(transactions.id, body.transferPairId));
      }
    }

    if (body.tags) {
      await db.delete(transactionTags).where(eq(transactionTags.transactionId, id));
      for (const name of body.tags.map((t) => t.trim()).filter(Boolean)) {
        const existing = await db.select().from(tags).where(eq(tags.name, name));
        const tagId = existing[0]?.id ?? nid();
        if (!existing[0]) await db.insert(tags).values({ id: tagId, name });
        await db.insert(transactionTags).values({ transactionId: id, tagId }).onConflictDoNothing();
      }
    }

    if (body.splits) {
      await db.delete(transactionSplits).where(eq(transactionSplits.transactionId, id));
      for (const part of body.splits) {
        await db.insert(transactionSplits).values({
          id: nid(),
          transactionId: id,
          categoryId: part.categoryId,
          ...sealedSplitWrite(
            {
              amountCents: part.amountCents ?? dollarsToCents(part.amount ?? 0),
              notes: part.notes,
            },
            dek,
          ),
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message === "forbidden" ? "You have view-only access." : "locked" }, { status: err.message === "forbidden" ? 403 : 401 });
    throw err;
  }
}
