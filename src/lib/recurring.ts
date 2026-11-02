import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { recurrences, suppressedMerchants, transactions } from "@/db/schema";
import { addCalendarMonths, addDays, todayISO } from "./dates";
import { nid } from "./ids";
import { inferRecurringKind, merchantKey } from "./plan";
import { openRecurrence, openTx, sealedRecurrenceWrite } from "./secrets";

async function blockedMerchants(): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.select({ merchantKey: suppressedMerchants.merchantKey }).from(suppressedMerchants);
  return new Set(rows.map((row) => row.merchantKey));
}

export async function suppressMerchant(name: string) {
  const key = merchantKey(name);
  if (!key) return;
  const db = await getDb();
  await db.insert(suppressedMerchants).values({ merchantKey: key }).onConflictDoNothing();
}

export async function unsuppressMerchant(name: string) {
  const key = merchantKey(name);
  if (!key) return;
  const db = await getDb();
  await db.delete(suppressedMerchants).where(eq(suppressedMerchants.merchantKey, key));
}

function medianInterval(dates: string[]): number | null {
  if (dates.length < 2) return null;
  const sorted = [...dates].sort();
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const a = new Date(`${sorted[i - 1]}T12:00:00`).getTime();
    const b = new Date(`${sorted[i]}T12:00:00`).getTime();
    gaps.push(Math.round((b - a) / 86400000));
  }
  gaps.sort((x, y) => x - y);
  return gaps[Math.floor(gaps.length / 2)] ?? null;
}

function cadenceFromGap(gap: number): string | null {
  if (gap >= 6 && gap <= 8) return "weekly";
  if (gap >= 13 && gap <= 16) return "biweekly";
  if (gap >= 26 && gap <= 35) return "monthly";
  if (gap >= 85 && gap <= 95) return "quarterly";
  if (gap >= 350 && gap <= 380) return "yearly";
  return null;
}

export function nextFromCadence(last: string, cadence: string): string {
  const map: Record<string, number> = {
    weekly: 7,
    biweekly: 14,
    monthly: 30,
    quarterly: 91,
    yearly: 365,
  };
  return addDays(last, map[cadence] ?? 30);
}

export type RecurrenceDraft = {
  merchantName: string;
  amountCents: number;
  cadence: string;
  nextDate: string;
  categoryId: string | null;
  accountId: string | null;
  isIncome: boolean;
  lastPaidDate: string;
  kind?: "bill" | "subscription";
};

async function collectDrafts(dek: Buffer, includeBlocked = false): Promise<RecurrenceDraft[]> {
  const db = await getDb();
  const txs = (await db.select().from(transactions)).map((tx) => openTx(tx, dek));
  const groups = new Map<string, typeof txs>();
  for (const tx of txs) {
    if (tx.hidden || tx.pending) continue;
    const key = merchantKey(tx.merchantName || tx.name);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(tx);
    groups.set(key, list);
  }

  const existing = (await db.select().from(recurrences)).map((row) => openRecurrence(row, dek));
  const blocked = await blockedMerchants();
  const drafts: RecurrenceDraft[] = [];

  for (const [merchant, list] of groups) {
    if (list.length < 2) continue;
    const amounts = list.map((t) => Math.abs(t.amountCents)).sort((a, b) => a - b);
    const mid = amounts[Math.floor(amounts.length / 2)];
    const similar = list.filter((t) => {
      const a = Math.abs(t.amountCents);
      return Math.abs(a - mid) / Math.max(mid, 1) <= 0.15;
    });
    if (similar.length < 2) continue;
    const dates = similar.map((t) => t.date);
    const gap = medianInterval(dates);
    if (gap == null) continue;
    const cadence = cadenceFromGap(gap);
    if (!cadence) continue;
    const last = dates.sort().at(-1)!;
    const already = existing.find((r) => merchantKey(r.merchantName) === merchant);
    if (already) continue;
    if (!includeBlocked && blocked.has(merchant)) continue;
    const sample = similar[0];
    drafts.push({
      merchantName: sample.merchantName || sample.name,
      amountCents: mid,
      cadence,
      nextDate: nextFromCadence(last, cadence),
      categoryId: sample.categoryId,
      accountId: sample.accountId,
      isIncome: sample.amountCents < 0,
      lastPaidDate: last,
    });
  }
  return drafts;
}

export async function previewRecurring(dek: Buffer, opts?: { includeBlocked?: boolean }) {
  return collectDrafts(dek, Boolean(opts?.includeBlocked));
}

export async function confirmRecurring(dek: Buffer, drafts: RecurrenceDraft[]) {
  const db = await getDb();
  const existing = new Set(
    (await db.select().from(recurrences)).map((row) => merchantKey(openRecurrence(row, dek).merchantName)),
  );
  const blocked = await blockedMerchants();
  let created = 0;
  for (const draft of drafts) {
    const merchant = merchantKey(draft.merchantName);
    if (!merchant || existing.has(merchant)) continue;
    if (blocked.has(merchant)) await unsuppressMerchant(draft.merchantName);
    await db.insert(recurrences).values({
      id: nid(),
      ...sealedRecurrenceWrite({ merchantName: draft.merchantName, amountCents: draft.amountCents }, dek),
      categoryId: draft.categoryId,
      accountId: draft.accountId,
      cadence: draft.cadence,
      nextDate: draft.nextDate,
      isIncome: draft.isIncome,
      isActive: true,
      source: "detected",
      lastPaidDate: draft.lastPaidDate,
      kind: draft.kind ?? inferRecurringKind(draft),
    });
    existing.add(merchant);
    created += 1;
  }
  return { created };
}

function advanceDueDate(due: string, cadence: string): string {
  if (cadence === "weekly") return addDays(due, 7);
  if (cadence === "biweekly") return addDays(due, 14);
  if (cadence === "quarterly") return addCalendarMonths(due, 3);
  if (cadence === "yearly") return addCalendarMonths(due, 12);
  return addCalendarMonths(due, 1);
}

export async function markRecurrencePaid(id: string, date = todayISO()) {
  const db = await getDb();
  const all = await db.select().from(recurrences);
  const found = all.find((r) => r.id === id);
  if (!found) throw new Error("Recurrence not found");
  const due = found.nextDate || date;
  await db
    .update(recurrences)
    .set({
      lastPaidDate: date,
      nextDate: advanceDueDate(due, found.cadence),
    })
    .where(eq(recurrences.id, id));
}
