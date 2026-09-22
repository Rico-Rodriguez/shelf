import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { rules } from "@/db/schema";
import { AuthError, requireDek, requireWriter } from "@/lib/auth";
import { nid } from "@/lib/ids";
import { applyRuleToUnreviewed } from "@/lib/rules";
import { openRule, sealedRuleWrite } from "@/lib/secrets";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const dek = await requireDek();
    const db = await getDb();
    const rows = (await db.select().from(rules)).map((row) => openRule(row, dek));
    return NextResponse.json({ rules: rows.sort((a, b) => a.priority - b.priority) });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message === "forbidden" ? "You have view-only access." : "locked" }, { status: err.message === "forbidden" ? 403 : 401 });
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    const dek = await requireWriter();
    const body = (await request.json()) as typeof rules.$inferInsert & { applyUnreviewed?: boolean };
    const { applyUnreviewed, ...ruleBody } = body;
    const db = await getDb();
    const id = nid();
    const sealed = sealedRuleWrite(
      {
        name: ruleBody.name || "Untitled rule",
        matchMerchant: ruleBody.matchMerchant,
        matchDescription: ruleBody.matchDescription,
        actionRename: ruleBody.actionRename,
        actionTagNames: ruleBody.actionTagNames,
        actionSplitJson: ruleBody.actionSplitJson,
        matchAmountMin: ruleBody.matchAmountMin,
        matchAmountMax: ruleBody.matchAmountMax,
      },
      dek,
    );
    await db.insert(rules).values({
      ...ruleBody,
      ...sealed,
      id,
    });
    if (!applyUnreviewed) return NextResponse.json({ id, applied: 0, ids: [], previous: [] });
    const [created] = await db.select().from(rules).where(eq(rules.id, id));
    const applied = created ? await applyRuleToUnreviewed(db, created, dek) : { applied: 0, ids: [], previous: [] };
    return NextResponse.json({ id, ...applied });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message === "forbidden" ? "You have view-only access." : "locked" }, { status: err.message === "forbidden" ? 403 : 401 });
    throw err;
  }
}
