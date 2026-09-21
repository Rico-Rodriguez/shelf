import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { rules } from "@/db/schema";
import { AuthError, requireDek } from "@/lib/auth";
import { applyRuleToExisting } from "@/lib/rules";
import { openRule, sealedRuleWrite } from "@/lib/secrets";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const dek = await requireDek();
    const { id } = await context.params;
    const body = (await request.json()) as Partial<typeof rules.$inferInsert> & { applyExisting?: boolean };
    const db = await getDb();
    const { applyExisting, secretEnc: _ignored, ...patch } = body;
    void _ignored;
    const [existing] = await db.select().from(rules).where(eq(rules.id, id));
    if (!existing) return NextResponse.json({ error: "missing" }, { status: 404 });
    const opened = openRule(existing, dek);
    const sealed = sealedRuleWrite(
      {
        name: patch.name ?? opened.name,
        matchMerchant: patch.matchMerchant !== undefined ? patch.matchMerchant : opened.matchMerchant,
        matchDescription: patch.matchDescription !== undefined ? patch.matchDescription : opened.matchDescription,
        actionRename: patch.actionRename !== undefined ? patch.actionRename : opened.actionRename,
        actionTagNames: patch.actionTagNames !== undefined ? patch.actionTagNames : opened.actionTagNames,
        actionSplitJson: patch.actionSplitJson !== undefined ? patch.actionSplitJson : opened.actionSplitJson,
        matchAmountMin: patch.matchAmountMin !== undefined ? patch.matchAmountMin : opened.matchAmountMin,
        matchAmountMax: patch.matchAmountMax !== undefined ? patch.matchAmountMax : opened.matchAmountMax,
      },
      dek,
    );
    await db
      .update(rules)
      .set({
        ...sealed,
        enabled: patch.enabled,
        priority: patch.priority,
        matchAccountId: patch.matchAccountId,
        matchCategoryId: patch.matchCategoryId,
        actionCategoryId: patch.actionCategoryId,
        actionHide: patch.actionHide,
        actionGoalId: patch.actionGoalId,
      })
      .where(eq(rules.id, id));
    let applied = 0;
    if (applyExisting) {
      const [rule] = await db.select().from(rules).where(eq(rules.id, id));
      if (rule) applied = await applyRuleToExisting(db, rule, dek);
    }
    return NextResponse.json({ ok: true, applied });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireDek();
    const { id } = await context.params;
    const db = await getDb();
    await db.delete(rules).where(eq(rules.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "locked" }, { status: 401 });
    throw err;
  }
}
