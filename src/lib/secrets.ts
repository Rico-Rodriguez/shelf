import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accounts,
  budgetItems,
  budgetMonths,
  goals,
  holdings,
  netWorthSnapshots,
  plaidItems,
  recurrences,
  rules,
  securities,
  settings,
  transactionSplits,
  transactions,
} from "@/db/schema";
import { decryptSecret, encryptSecret } from "./crypto";

const MARK = "s1.";

type Bag = Record<string, number | string | null>;

export function isSealed(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(MARK);
}

export function sealText(value: string | null | undefined, dek: Buffer): string | null {
  if (value == null) return null;
  if (isSealed(value)) return value;
  return MARK + encryptSecret(value, dek);
}

export function openText(value: string | null | undefined, dek: Buffer): string | null {
  if (value == null) return null;
  if (!isSealed(value)) return value;
  try {
    return decryptSecret(value.slice(MARK.length), dek);
  } catch {
    return null;
  }
}

function sealBag(bag: Bag, dek: Buffer): string {
  return MARK + encryptSecret(JSON.stringify(bag), dek);
}

function openBag(payload: string | null | undefined, dek: Buffer): Bag | null {
  if (!payload || !isSealed(payload)) return null;
  try {
    const parsed = JSON.parse(decryptSecret(payload.slice(MARK.length), dek)) as unknown;
    if (parsed && typeof parsed === "object") return parsed as Bag;
  } catch {
    return null;
  }
  return null;
}

function readable(payload: string | null | undefined, dek: Buffer): boolean {
  if (!payload) return true;
  return openBag(payload, dek) != null;
}

function pickNum(bag: Bag | null, key: string, fallback: number): number {
  if (bag && Object.prototype.hasOwnProperty.call(bag, key) && typeof bag[key] === "number") return bag[key] as number;
  return fallback;
}

function pickNumNull(bag: Bag | null, key: string, fallback: number | null): number | null {
  if (bag && Object.prototype.hasOwnProperty.call(bag, key)) {
    const value = bag[key];
    if (value == null) return null;
    if (typeof value === "number") return value;
  }
  return fallback;
}

function pickStr(bag: Bag | null, key: string, fallback: string): string {
  if (bag && Object.prototype.hasOwnProperty.call(bag, key) && typeof bag[key] === "string") return bag[key] as string;
  return fallback;
}

function textSealed(value: string | null | undefined): boolean {
  return value == null || value === "" || isSealed(value);
}

type AccountRow = typeof accounts.$inferSelect;

export function openAccount<T extends AccountRow>(row: T, dek: Buffer): T {
  const bag = openBag(row.secretEnc, dek);
  return {
    ...row,
    name: openText(row.name, dek) || "",
    officialName: openText(row.officialName, dek),
    mask: openText(row.mask, dek),
    liabilityJson: openText(row.liabilityJson, dek),
    currentBalanceCents: pickNum(bag, "currentBalanceCents", row.currentBalanceCents),
    availableBalanceCents: pickNumNull(bag, "availableBalanceCents", row.availableBalanceCents),
    secretEnc: null,
  };
}

export function sealedAccountWrite(
  plain: {
    name: string;
    officialName?: string | null;
    mask?: string | null;
    liabilityJson?: string | null;
    currentBalanceCents: number;
    availableBalanceCents?: number | null;
  },
  dek: Buffer,
) {
  const fields: {
    name: string;
    officialName?: string | null;
    mask?: string | null;
    liabilityJson?: string | null;
    currentBalanceCents: number;
    availableBalanceCents: number | null;
    secretEnc: string;
  } = {
    name: sealText(plain.name || "Account", dek)!,
    currentBalanceCents: 0,
    availableBalanceCents: null,
    secretEnc: sealBag(
      {
        currentBalanceCents: plain.currentBalanceCents,
        availableBalanceCents: plain.availableBalanceCents ?? null,
      },
      dek,
    ),
  };
  if ("officialName" in plain) fields.officialName = sealText(plain.officialName ?? null, dek);
  if ("mask" in plain) fields.mask = sealText(plain.mask ?? null, dek);
  if ("liabilityJson" in plain) fields.liabilityJson = sealText(plain.liabilityJson ?? null, dek);
  return fields;
}

type TxRow = typeof transactions.$inferSelect;

export function openTx<T extends TxRow>(row: T, dek: Buffer): T {
  const bag = openBag(row.secretEnc, dek);
  return {
    ...row,
    name: openText(row.name, dek) || "",
    merchantName: openText(row.merchantName, dek),
    originalDescription: openText(row.originalDescription, dek),
    notes: openText(row.notes, dek),
    amountCents: pickNum(bag, "amountCents", row.amountCents),
    secretEnc: null,
  };
}

export function sealedTxWrite(
  plain: {
    name: string;
    merchantName?: string | null;
    originalDescription?: string | null;
    notes?: string | null;
    amountCents: number;
  },
  dek: Buffer,
) {
  return {
    name: sealText(plain.name || "Transaction", dek)!,
    merchantName: sealText(plain.merchantName ?? null, dek),
    originalDescription: sealText(plain.originalDescription ?? null, dek),
    notes: sealText(plain.notes ?? null, dek),
    amountCents: 0,
    secretEnc: sealBag({ amountCents: plain.amountCents }, dek),
  };
}

export function sealTxPatch<T extends { name?: string; merchantName?: string | null }>(patch: T, dek: Buffer): T {
  const next = { ...patch };
  if (next.name) next.name = sealText(next.name, dek)!;
  if (next.merchantName) next.merchantName = sealText(next.merchantName, dek);
  return next;
}

type SplitRow = typeof transactionSplits.$inferSelect;

export function openSplit<T extends SplitRow>(row: T, dek: Buffer): T {
  const bag = openBag(row.secretEnc, dek);
  return {
    ...row,
    notes: openText(row.notes, dek),
    amountCents: pickNum(bag, "amountCents", row.amountCents),
    secretEnc: null,
  };
}

export function sealedSplitWrite(plain: { amountCents: number; notes?: string | null }, dek: Buffer) {
  return {
    amountCents: 0,
    notes: sealText(plain.notes ?? null, dek),
    secretEnc: sealBag({ amountCents: plain.amountCents }, dek),
  };
}

type HoldingRow = typeof holdings.$inferSelect;

export function openHolding<T extends HoldingRow>(row: T, dek: Buffer): T {
  const bag = openBag(row.secretEnc, dek);
  return {
    ...row,
    quantity: pickStr(bag, "quantity", row.quantity),
    costBasisCents: pickNumNull(bag, "costBasisCents", row.costBasisCents),
    institutionValueCents: pickNum(bag, "institutionValueCents", row.institutionValueCents),
    institutionPriceCents: pickNumNull(bag, "institutionPriceCents", row.institutionPriceCents),
    secretEnc: null,
  };
}

export function sealedHoldingWrite(
  plain: {
    quantity: string;
    costBasisCents?: number | null;
    institutionValueCents: number;
    institutionPriceCents?: number | null;
  },
  dek: Buffer,
) {
  return {
    quantity: "0",
    costBasisCents: null as number | null,
    institutionValueCents: 0,
    institutionPriceCents: null as number | null,
    secretEnc: sealBag(
      {
        quantity: plain.quantity,
        costBasisCents: plain.costBasisCents ?? null,
        institutionValueCents: plain.institutionValueCents,
        institutionPriceCents: plain.institutionPriceCents ?? null,
      },
      dek,
    ),
  };
}

type SecurityRow = typeof securities.$inferSelect;

export function openSecurity<T extends SecurityRow>(row: T, dek: Buffer): T {
  const bag = openBag(row.secretEnc, dek);
  return {
    ...row,
    name: openText(row.name, dek) || "",
    ticker: openText(row.ticker, dek),
    closePriceCents: pickNumNull(bag, "closePriceCents", row.closePriceCents),
    secretEnc: null,
  };
}

export function sealedSecurityWrite(
  plain: { name: string; ticker?: string | null; closePriceCents?: number | null },
  dek: Buffer,
) {
  return {
    name: sealText(plain.name || "Security", dek)!,
    ticker: sealText(plain.ticker ?? null, dek),
    closePriceCents: null as number | null,
    secretEnc: sealBag({ closePriceCents: plain.closePriceCents ?? null }, dek),
  };
}

type GoalRow = typeof goals.$inferSelect;

export function openGoal<T extends GoalRow>(row: T, dek: Buffer): T {
  const bag = openBag(row.secretEnc, dek);
  return {
    ...row,
    name: openText(row.name, dek) || "",
    targetCents: pickNum(bag, "targetCents", row.targetCents),
    secretEnc: null,
  };
}

export function sealedGoalWrite(plain: { name: string; targetCents: number }, dek: Buffer) {
  return {
    name: sealText(plain.name || "Goal", dek)!,
    targetCents: 0,
    secretEnc: sealBag({ targetCents: plain.targetCents }, dek),
  };
}

type RecurrenceRow = typeof recurrences.$inferSelect;

export function openRecurrence<T extends RecurrenceRow>(row: T, dek: Buffer): T {
  const bag = openBag(row.secretEnc, dek);
  return {
    ...row,
    merchantName: openText(row.merchantName, dek) || "",
    amountCents: pickNum(bag, "amountCents", row.amountCents),
    secretEnc: null,
  };
}

export function sealedRecurrenceWrite(plain: { merchantName: string; amountCents: number }, dek: Buffer) {
  return {
    merchantName: sealText(plain.merchantName || "Recurring", dek)!,
    amountCents: 0,
    secretEnc: sealBag({ amountCents: plain.amountCents }, dek),
  };
}

type SnapshotRow = typeof netWorthSnapshots.$inferSelect;

export function openSnapshot<T extends SnapshotRow>(row: T, dek: Buffer): T {
  const bag = openBag(row.secretEnc, dek);
  return {
    ...row,
    assetsCents: pickNum(bag, "assetsCents", row.assetsCents),
    liabilitiesCents: pickNum(bag, "liabilitiesCents", row.liabilitiesCents),
    netWorthCents: pickNum(bag, "netWorthCents", row.netWorthCents),
    secretEnc: null,
  };
}

export function sealedSnapshotWrite(
  plain: { assetsCents: number; liabilitiesCents: number; netWorthCents: number },
  dek: Buffer,
) {
  return {
    assetsCents: 0,
    liabilitiesCents: 0,
    netWorthCents: 0,
    secretEnc: sealBag(
      {
        assetsCents: plain.assetsCents,
        liabilitiesCents: plain.liabilitiesCents,
        netWorthCents: plain.netWorthCents,
      },
      dek,
    ),
  };
}

type BudgetItemRow = typeof budgetItems.$inferSelect;

export function openBudgetItem<T extends BudgetItemRow>(row: T, dek: Buffer): T {
  const bag = openBag(row.secretEnc, dek);
  return {
    ...row,
    plannedCents: pickNum(bag, "plannedCents", row.plannedCents),
    rolloverInCents: pickNum(bag, "rolloverInCents", row.rolloverInCents),
    secretEnc: null,
  };
}

export function sealedBudgetItemWrite(plannedCents: number, rolloverInCents: number, dek: Buffer) {
  return {
    plannedCents: 0,
    rolloverInCents: 0,
    secretEnc: sealBag({ plannedCents, rolloverInCents }, dek),
  };
}

type BudgetMonthRow = typeof budgetMonths.$inferSelect;

export function openBudgetMonth<T extends BudgetMonthRow>(row: T, dek: Buffer): T {
  const bag = openBag(row.secretEnc, dek);
  return {
    ...row,
    plannedIncomeCents: pickNum(bag, "plannedIncomeCents", row.plannedIncomeCents),
    secretEnc: null,
  };
}

export function sealedBudgetMonthWrite(plannedIncomeCents: number, dek: Buffer) {
  return {
    plannedIncomeCents: 0,
    secretEnc: sealBag({ plannedIncomeCents }, dek),
  };
}

type SettingsRow = typeof settings.$inferSelect;

export function openSettings<T extends SettingsRow>(row: T, dek: Buffer): T {
  const bag = openBag(row.secretEnc, dek);
  return {
    ...row,
    plannedIncomeCents: pickNum(bag, "plannedIncomeCents", row.plannedIncomeCents),
    secretEnc: null,
  };
}

export function sealedSettingsIncome(plannedIncomeCents: number, dek: Buffer) {
  return {
    plannedIncomeCents: 0,
    secretEnc: sealBag({ plannedIncomeCents }, dek),
  };
}

type RuleRow = typeof rules.$inferSelect;

export function openRule<T extends RuleRow>(row: T, dek: Buffer): T {
  const bag = openBag(row.secretEnc, dek);
  return {
    ...row,
    name: openText(row.name, dek) || "",
    matchMerchant: openText(row.matchMerchant, dek),
    matchDescription: openText(row.matchDescription, dek),
    actionRename: openText(row.actionRename, dek),
    actionTagNames: openText(row.actionTagNames, dek),
    actionSplitJson: openText(row.actionSplitJson, dek),
    matchAmountMin: pickNumNull(bag, "matchAmountMin", row.matchAmountMin),
    matchAmountMax: pickNumNull(bag, "matchAmountMax", row.matchAmountMax),
    secretEnc: null,
  };
}

export function sealedRuleWrite(
  plain: {
    name: string;
    matchMerchant?: string | null;
    matchDescription?: string | null;
    actionRename?: string | null;
    actionTagNames?: string | null;
    actionSplitJson?: string | null;
    matchAmountMin?: number | null;
    matchAmountMax?: number | null;
  },
  dek: Buffer,
) {
  return {
    name: sealText(plain.name || "Rule", dek)!,
    matchMerchant: sealText(plain.matchMerchant ?? null, dek),
    matchDescription: sealText(plain.matchDescription ?? null, dek),
    actionRename: sealText(plain.actionRename ?? null, dek),
    actionTagNames: sealText(plain.actionTagNames ?? null, dek),
    actionSplitJson: sealText(plain.actionSplitJson ?? null, dek),
    matchAmountMin: null as number | null,
    matchAmountMax: null as number | null,
    secretEnc: sealBag(
      {
        matchAmountMin: plain.matchAmountMin ?? null,
        matchAmountMax: plain.matchAmountMax ?? null,
      },
      dek,
    ),
  };
}

export function openInstitutionName(value: string | null | undefined, dek: Buffer): string | null {
  return openText(value, dek);
}

function accountNeedsSeal(row: AccountRow): boolean {
  if (!isSealed(row.secretEnc) || !isSealed(row.name)) return true;
  if (!textSealed(row.officialName) || !textSealed(row.mask) || !textSealed(row.liabilityJson)) return true;
  return false;
}

function txNeedsSeal(row: TxRow): boolean {
  if (!isSealed(row.secretEnc) || !isSealed(row.name)) return true;
  return !textSealed(row.merchantName) || !textSealed(row.originalDescription) || !textSealed(row.notes);
}

function ruleNeedsSeal(row: RuleRow): boolean {
  if (!isSealed(row.secretEnc) || !isSealed(row.name)) return true;
  return (
    !textSealed(row.matchMerchant) ||
    !textSealed(row.matchDescription) ||
    !textSealed(row.actionRename) ||
    !textSealed(row.actionTagNames) ||
    !textSealed(row.actionSplitJson)
  );
}

export async function prepareVault(dek: Buffer) {
  try {
    const db = await getDb();

    for (const row of await db.select().from(accounts)) {
      if (!accountNeedsSeal(row) || !readable(row.secretEnc, dek)) continue;
      const opened = openAccount(row, dek);
      await db
        .update(accounts)
        .set({
          ...sealedAccountWrite(
            {
              name: opened.name,
              officialName: opened.officialName,
              mask: opened.mask,
              liabilityJson: opened.liabilityJson,
              currentBalanceCents: opened.currentBalanceCents,
              availableBalanceCents: opened.availableBalanceCents,
            },
            dek,
          ),
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, row.id));
    }

    for (const row of await db.select().from(transactions)) {
      if (!txNeedsSeal(row) || !readable(row.secretEnc, dek)) continue;
      const opened = openTx(row, dek);
      await db
        .update(transactions)
        .set({
          ...sealedTxWrite(
            {
              name: opened.name,
              merchantName: opened.merchantName,
              originalDescription: opened.originalDescription,
              notes: opened.notes,
              amountCents: opened.amountCents,
            },
            dek,
          ),
          updatedAt: new Date(),
        })
        .where(eq(transactions.id, row.id));
    }

    for (const row of await db.select().from(transactionSplits)) {
      const notesOk = textSealed(row.notes);
      if (isSealed(row.secretEnc) && notesOk) continue;
      if (!readable(row.secretEnc, dek)) continue;
      const opened = openSplit(row, dek);
      await db
        .update(transactionSplits)
        .set(sealedSplitWrite({ amountCents: opened.amountCents, notes: opened.notes }, dek))
        .where(eq(transactionSplits.id, row.id));
    }

    for (const row of await db.select().from(holdings)) {
      if (isSealed(row.secretEnc)) continue;
      const opened = openHolding(row, dek);
      await db
        .update(holdings)
        .set(
          sealedHoldingWrite(
            {
              quantity: opened.quantity,
              costBasisCents: opened.costBasisCents,
              institutionValueCents: opened.institutionValueCents,
              institutionPriceCents: opened.institutionPriceCents,
            },
            dek,
          ),
        )
        .where(eq(holdings.id, row.id));
    }

    for (const row of await db.select().from(securities)) {
      if (isSealed(row.secretEnc) && isSealed(row.name) && textSealed(row.ticker)) continue;
      if (!readable(row.secretEnc, dek)) continue;
      const opened = openSecurity(row, dek);
      await db
        .update(securities)
        .set(
          sealedSecurityWrite(
            { name: opened.name, ticker: opened.ticker, closePriceCents: opened.closePriceCents },
            dek,
          ),
        )
        .where(eq(securities.id, row.id));
    }

    for (const row of await db.select().from(goals)) {
      if (isSealed(row.secretEnc) && isSealed(row.name)) continue;
      if (!readable(row.secretEnc, dek)) continue;
      const opened = openGoal(row, dek);
      await db
        .update(goals)
        .set(sealedGoalWrite({ name: opened.name, targetCents: opened.targetCents }, dek))
        .where(eq(goals.id, row.id));
    }

    for (const row of await db.select().from(recurrences)) {
      if (isSealed(row.secretEnc) && isSealed(row.merchantName)) continue;
      if (!readable(row.secretEnc, dek)) continue;
      const opened = openRecurrence(row, dek);
      await db
        .update(recurrences)
        .set(sealedRecurrenceWrite({ merchantName: opened.merchantName, amountCents: opened.amountCents }, dek))
        .where(eq(recurrences.id, row.id));
    }

    for (const row of await db.select().from(netWorthSnapshots)) {
      if (isSealed(row.secretEnc)) continue;
      const opened = openSnapshot(row, dek);
      await db
        .update(netWorthSnapshots)
        .set(
          sealedSnapshotWrite(
            {
              assetsCents: opened.assetsCents,
              liabilitiesCents: opened.liabilitiesCents,
              netWorthCents: opened.netWorthCents,
            },
            dek,
          ),
        )
        .where(eq(netWorthSnapshots.id, row.id));
    }

    for (const row of await db.select().from(budgetItems)) {
      if (isSealed(row.secretEnc)) continue;
      const opened = openBudgetItem(row, dek);
      await db
        .update(budgetItems)
        .set(sealedBudgetItemWrite(opened.plannedCents, opened.rolloverInCents, dek))
        .where(eq(budgetItems.id, row.id));
    }

    for (const row of await db.select().from(budgetMonths)) {
      if (isSealed(row.secretEnc)) continue;
      const opened = openBudgetMonth(row, dek);
      await db
        .update(budgetMonths)
        .set(sealedBudgetMonthWrite(opened.plannedIncomeCents, dek))
        .where(eq(budgetMonths.id, row.id));
    }

    for (const row of await db.select().from(settings)) {
      if (isSealed(row.secretEnc) || row.plannedIncomeCents === 0) continue;
      await db.update(settings).set(sealedSettingsIncome(row.plannedIncomeCents, dek)).where(eq(settings.id, row.id));
    }

    for (const row of await db.select().from(rules)) {
      if (!ruleNeedsSeal(row) || !readable(row.secretEnc, dek)) continue;
      const opened = openRule(row, dek);
      await db
        .update(rules)
        .set(
          sealedRuleWrite(
            {
              name: opened.name,
              matchMerchant: opened.matchMerchant,
              matchDescription: opened.matchDescription,
              actionRename: opened.actionRename,
              actionTagNames: opened.actionTagNames,
              actionSplitJson: opened.actionSplitJson,
              matchAmountMin: opened.matchAmountMin,
              matchAmountMax: opened.matchAmountMax,
            },
            dek,
          ),
        )
        .where(eq(rules.id, row.id));
    }

    for (const row of await db.select().from(plaidItems)) {
      if (!row.institutionName || isSealed(row.institutionName)) continue;
      await db
        .update(plaidItems)
        .set({ institutionName: sealText(row.institutionName, dek) })
        .where(eq(plaidItems.id, row.id));
    }
  } catch (err) {
    console.error("vault seal failed", err instanceof Error ? err.message : "error");
  }
}
