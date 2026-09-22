import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { transactions } from "@/db/schema";
import { AuthError, requireDek } from "@/lib/auth";
import { ruleMatches, type RuleRow } from "@/lib/rules";
import { openTx } from "@/lib/secrets";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const dek = await requireDek();
    const body = (await request.json()) as {
      matchMerchant?: string | null;
      matchDescription?: string | null;
      matchAmountMin?: number | null;
      matchAmountMax?: number | null;
      matchAccountId?: string | null;
      matchCategoryId?: string | null;
    };
    const rule = {
      enabled: true,
      matchMerchant: body.matchMerchant || null,
      matchDescription: body.matchDescription || null,
      matchAmountMin: body.matchAmountMin ?? null,
      matchAmountMax: body.matchAmountMax ?? null,
      matchAccountId: body.matchAccountId || null,
      matchCategoryId: body.matchCategoryId || null,
    } as RuleRow;
    const db = await getDb();
    const matches = (await db.select().from(transactions))
      .map((row) => openTx(row, dek))
      .filter((tx) => ruleMatches(rule, tx));
    return NextResponse.json({
      count: matches.length,
      samples: matches.slice(0, 5).map((tx) => ({ id: tx.id, name: tx.name, amountCents: tx.amountCents, date: tx.date })),
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}
