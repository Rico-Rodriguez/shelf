import { eq } from "drizzle-orm";
import type { AppDb } from "@/db";
import { rules, tags, transactionSplits, transactionTags, transactions } from "@/db/schema";
import { nid } from "./ids";
import { sameMerchant } from "./plan";
import { openRule, openTx, sealedSplitWrite, sealTxPatch } from "./secrets";

/** What a charge looked like before a rule touched it, so undo can put it back. */
export type AppliedReview = {
  id: string;
  categoryId: string | null;
  reviewed: boolean;
  hidden: boolean;
  name?: string;
  merchantName?: string | null;
};

export type RuleRow = typeof rules.$inferSelect;
export type TxPatch = {
  name?: string;
  merchantName?: string | null;
  categoryId?: string | null;
  hidden?: boolean;
  goalId?: string | null;
  isTransfer?: boolean;
};

export function ruleMatches(
  rule: RuleRow,
  tx: {
    name: string;
    merchantName?: string | null;
    originalDescription?: string | null;
    amountCents: number;
    accountId: string;
    categoryId?: string | null;
  },
): boolean {
  if (!rule.enabled) return false;
  if (rule.matchMerchant) {
    const names = [tx.merchantName, tx.name].filter((name): name is string => Boolean(name));
    if (!names.some((name) => sameMerchant(rule.matchMerchant!, name))) return false;
  }
  if (rule.matchDescription) {
    const hay = `${tx.originalDescription ?? ""} ${tx.name}`.toLowerCase();
    if (!hay.includes(rule.matchDescription.toLowerCase())) return false;
  }
  if (rule.matchAmountMin != null && Math.abs(tx.amountCents) < rule.matchAmountMin) return false;
  if (rule.matchAmountMax != null && Math.abs(tx.amountCents) > rule.matchAmountMax) return false;
  if (rule.matchAccountId && tx.accountId !== rule.matchAccountId) return false;
  if (rule.matchCategoryId && tx.categoryId !== rule.matchCategoryId) return false;
  return Boolean(
    rule.matchMerchant ||
      rule.matchDescription ||
      rule.matchAmountMin != null ||
      rule.matchAmountMax != null ||
      rule.matchAccountId ||
      rule.matchCategoryId,
  );
}

export function applyRuleToFields(rule: RuleRow, patch: TxPatch): TxPatch {
  const next = { ...patch };
  if (rule.actionRename) {
    next.name = rule.actionRename;
    next.merchantName = rule.actionRename;
  }
  if (rule.actionCategoryId) next.categoryId = rule.actionCategoryId;
  if (rule.actionHide) next.hidden = true;
  if (rule.actionGoalId) next.goalId = rule.actionGoalId;
  if (next.categoryId === "cat-transfer" || next.categoryId === "cat-cc-payment" || next.categoryId === "cat-invest") {
    next.isTransfer = true;
  }
  return next;
}

export async function applyRulesToNewTx(
  db: AppDb,
  txId: string,
  input: {
    name: string;
    merchantName?: string | null;
    originalDescription?: string | null;
    amountCents: number;
    accountId: string;
    categoryId?: string | null;
  },
  dek: Buffer,
): Promise<TxPatch> {
  const all = (await db.select().from(rules)).map((rule) => openRule(rule, dek));
  const sorted = all.sort((a, b) => a.priority - b.priority);
  let patch: TxPatch = {};
  const working = { ...input };
  for (const rule of sorted) {
    if (!ruleMatches(rule, working)) continue;
    patch = applyRuleToFields(rule, patch);
    if (patch.name) working.name = patch.name;
    if (patch.merchantName !== undefined) working.merchantName = patch.merchantName;
    if (patch.categoryId !== undefined) working.categoryId = patch.categoryId;
    await applyRuleSideEffects(db, txId, rule, dek);
  }
  return sealTxPatch(patch, dek);
}

async function applyRuleSideEffects(db: AppDb, txId: string, rule: RuleRow, dek: Buffer) {
  if (rule.actionTagNames) {
    const names = rule.actionTagNames.split(",").map((s) => s.trim()).filter(Boolean);
    for (const name of names) {
      const existing = await db.select().from(tags).where(eq(tags.name, name));
      const tagId = existing[0]?.id ?? nid();
      if (!existing[0]) {
        await db.insert(tags).values({ id: tagId, name, color: "#7BA3A0" });
      }
      await db.insert(transactionTags).values({ transactionId: txId, tagId }).onConflictDoNothing();
    }
  }
  if (rule.actionSplitJson) {
    try {
      const parts = JSON.parse(rule.actionSplitJson) as { categoryId: string; amountCents: number; notes?: string }[];
      await db.delete(transactionSplits).where(eq(transactionSplits.transactionId, txId));
      for (const part of parts) {
        await db.insert(transactionSplits).values({
          id: nid(),
          transactionId: txId,
          categoryId: part.categoryId,
          ...sealedSplitWrite({ amountCents: part.amountCents, notes: part.notes }, dek),
        });
      }
    } catch {
      // ignore malformed split json
    }
  }
}

/** Apply a new rule to every matching charge, on screen or not, reviewed or still open. */
export async function applyRuleToMatches(db: AppDb, rule: RuleRow, dek: Buffer) {
  const openedRule = openRule(rule, dek);
  if (!openedRule.actionCategoryId && !openedRule.actionRename && !openedRule.actionHide) {
    return { applied: 0, ids: [] as string[], previous: [] as AppliedReview[] };
  }
  const txs = await db.select().from(transactions);
  const previous: AppliedReview[] = [];
  for (const tx of txs) {
    const opened = openTx(tx, dek);
    if (!ruleMatches(openedRule, opened)) continue;
    const patch = sealTxPatch(applyRuleToFields(openedRule, {}), dek);
    await db
      .update(transactions)
      .set({ ...patch, reviewed: true, updatedAt: new Date() })
      .where(eq(transactions.id, tx.id));
    await applyRuleSideEffects(db, tx.id, openedRule, dek);
    previous.push({
      id: tx.id,
      categoryId: tx.categoryId,
      reviewed: tx.reviewed,
      hidden: tx.hidden,
      ...(openedRule.actionRename ? { name: opened.name, merchantName: opened.merchantName } : {}),
    });
  }
  return { applied: previous.length, ids: previous.map((row) => row.id), previous };
}

export async function applyRuleToExisting(db: AppDb, rule: RuleRow, dek: Buffer) {
  const openedRule = openRule(rule, dek);
  const txs = await db.select().from(transactions);
  let applied = 0;
  for (const tx of txs) {
    const opened = openTx(tx, dek);
    if (!ruleMatches(openedRule, opened)) continue;
    const patch = sealTxPatch(applyRuleToFields(openedRule, {}), dek);
    if (Object.keys(patch).length) {
      await db.update(transactions).set({ ...patch, updatedAt: new Date() }).where(eq(transactions.id, tx.id));
    }
    await applyRuleSideEffects(db, tx.id, openedRule, dek);
    applied += 1;
  }
  return applied;
}

export async function reapplyAllRules(db: AppDb, txId: string, dek: Buffer) {
  const [tx] = await db.select().from(transactions).where(eq(transactions.id, txId));
  if (!tx) return;
  const opened = openTx(tx, dek);
  const patch = await applyRulesToNewTx(db, txId, opened, dek);
  if (Object.keys(patch).length) {
    await db.update(transactions).set({ ...patch, updatedAt: new Date() }).where(eq(transactions.id, txId));
  }
}
