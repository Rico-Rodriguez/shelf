import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { rules } from "@/db/schema";
import { AuthError, requireDek } from "@/lib/auth";
import { nid } from "@/lib/ids";
import { openRule, sealedRuleWrite } from "@/lib/secrets";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const dek = await requireDek();
    const db = await getDb();
    const rows = (await db.select().from(rules)).map((row) => openRule(row, dek));
    return NextResponse.json({ rules: rows.sort((a, b) => a.priority - b.priority) });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    const dek = await requireDek();
    const body = (await request.json()) as typeof rules.$inferInsert;
    const db = await getDb();
    const id = nid();
    const sealed = sealedRuleWrite(
      {
        name: body.name || "Untitled rule",
        matchMerchant: body.matchMerchant,
        matchDescription: body.matchDescription,
        actionRename: body.actionRename,
        actionTagNames: body.actionTagNames,
        actionSplitJson: body.actionSplitJson,
        matchAmountMin: body.matchAmountMin,
        matchAmountMax: body.matchAmountMax,
      },
      dek,
    );
    await db.insert(rules).values({
      ...body,
      ...sealed,
      id,
    });
    return NextResponse.json({ id });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}
