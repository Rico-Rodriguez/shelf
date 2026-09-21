import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { recurrences, transactions } from "@/db/schema";
import { addDays, todayISO } from "./dates";
import { nid } from "./ids";
import { openRecurrence, openTx, sealedRecurrenceWrite } from "./secrets";

function normalizeMerchant(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function medianInterval(dates: string[]): number | null {
  if (dates.length < 3) return null;
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

export async function detectRecurring(dek: Buffer) {
  const db = await getDb();
  const txs = (await db.select().from(transactions)).map((tx) => openTx(tx, dek));
  const groups = new Map<string, typeof txs>();
  for (const tx of txs) {
    if (tx.hidden || tx.pending) continue;
    const key = normalizeMerchant(tx.merchantName || tx.name);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(tx);
    groups.set(key, list);
  }

  const existing = (await db.select().from(recurrences)).map((row) => openRecurrence(row, dek));
  let created = 0;

  for (const [merchant, list] of groups) {
    if (list.length < 3) continue;
    const amounts = list.map((t) => Math.abs(t.amountCents)).sort((a, b) => a - b);
    const mid = amounts[Math.floor(amounts.length / 2)];
    const similar = list.filter((t) => {
      const a = Math.abs(t.amountCents);
      return Math.abs(a - mid) / Math.max(mid, 1) <= 0.15;
    });
    if (similar.length < 3) continue;
    const dates = similar.map((t) => t.date);
    const gap = medianInterval(dates);
    if (gap == null) continue;
    const cadence = cadenceFromGap(gap);
    if (!cadence) continue;
    const last = dates.sort().at(-1)!;
    const already = existing.find((r) => normalizeMerchant(r.merchantName) === merchant);
    if (already) continue;
    const sample = similar[0];
    await db.insert(recurrences).values({
      id: nid(),
      ...sealedRecurrenceWrite({ merchantName: sample.merchantName || sample.name, amountCents: mid }, dek),
      categoryId: sample.categoryId,
      accountId: sample.accountId,
      cadence,
      nextDate: nextFromCadence(last, cadence),
      isIncome: sample.amountCents < 0,
      isActive: true,
      source: "detected",
      lastPaidDate: last,
    });
    created += 1;
  }
  return { created };
}

export async function markRecurrencePaid(id: string, date = todayISO()) {
  const db = await getDb();
  const all = await db.select().from(recurrences);
  const found = all.find((r) => r.id === id);
  if (!found) throw new Error("Recurrence not found");
  await db
    .update(recurrences)
    .set({
      lastPaidDate: date,
      nextDate: nextFromCadence(date, found.cadence),
    })
    .where(eq(recurrences.id, id));
}
