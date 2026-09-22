import { addDays, todayISO } from "./dates";

const STEP: Record<string, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  quarterly: 91,
  yearly: 365,
};

const ANNUAL: Record<string, number> = {
  weekly: 52,
  biweekly: 26,
  monthly: 12,
  quarterly: 4,
  yearly: 1,
};

export function annualizedCents(amountCents: number, cadence: string) {
  return amountCents * (ANNUAL[cadence] ?? 12);
}

export function inferRecurringKind(input: { isIncome: boolean; cadence: string; amountCents: number }): "bill" | "subscription" {
  if (input.isIncome) return "bill";
  if ((input.cadence === "monthly" || input.cadence === "yearly" || input.cadence === "weekly") && input.amountCents > 0 && input.amountCents <= 6000) {
    return "subscription";
  }
  return "bill";
}

export function recurrenceHits(nextDate: string, cadence: string, date: string) {
  if (date < nextDate) return false;
  const step = STEP[cadence] ?? 30;
  const a = new Date(`${nextDate}T12:00:00`).getTime();
  const b = new Date(`${date}T12:00:00`).getTime();
  const days = Math.round((b - a) / 86400000);
  return days >= 0 && days % step === 0;
}

function ordinal(n: number) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function budgetPace(
  spent: number,
  available: number,
  year: number,
  month: number,
  today = new Date(),
): { label: string; tone: "on" | "hot" | "over" | "muted" } {
  if (available <= 0) return { label: spent > 0 ? "No budget" : "", tone: "muted" };
  if (spent > available) return { label: "Over", tone: "over" };
  const days = new Date(year, month, 0).getDate();
  const inMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const day = inMonth ? Math.min(today.getDate(), days) : days;
  const expected = day / days;
  const ratio = spent / available;
  if (ratio > expected + 0.12 && spent > 0 && inMonth) {
    const daily = spent / Math.max(day, 1);
    const daysOfMoney = daily > 0 ? (available - spent) / daily : days;
    const gone = new Date(year, month - 1, day);
    gone.setDate(gone.getDate() + Math.max(0, Math.floor(daysOfMoney)));
    if (gone.getMonth() !== month - 1) return { label: "Ahead of pace", tone: "hot" };
    return { label: `At this rate, gone by the ${ordinal(gone.getDate())}`, tone: "hot" };
  }
  if (ratio + 0.12 < expected && spent >= 0) return { label: "Under pace", tone: "on" };
  return { label: "On pace", tone: "on" };
}

export function monthsUntil(target: string, today = todayISO()) {
  const a = new Date(`${today}T12:00:00`);
  const b = new Date(`${target}T12:00:00`);
  const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (months > 0) return months;
  return b > a ? 1 : 1;
}

export function monthlyNeed(remainingCents: number, targetDate: string | null, today = todayISO()) {
  if (!targetDate || remainingCents <= 0) return null;
  if (targetDate < today) return remainingCents;
  return Math.ceil(remainingCents / monthsUntil(targetDate, today));
}

export function projectBalances(
  startCents: number,
  rows: { nextDate: string; cadence: string; amountCents: number; isIncome: boolean; isActive: boolean }[],
  days = 30,
  today = todayISO(),
) {
  const points: { date: string; balanceCents: number }[] = [];
  let balance = startCents;
  for (let i = 0; i < days; i += 1) {
    const date = addDays(today, i);
    for (const row of rows) {
      if (!row.isActive) continue;
      if (!recurrenceHits(row.nextDate, row.cadence, date)) continue;
      balance += row.isIncome ? row.amountCents : -row.amountCents;
    }
    points.push({ date, balanceCents: balance });
  }
  return points;
}

export function netWorthDelta(snapshots: { date: string; netWorthCents: number }[], today = todayISO()) {
  if (snapshots.length < 2) return null;
  const latest = snapshots[snapshots.length - 1];
  const cutoff = addDays(today, -30);
  let prior = snapshots[0];
  for (const row of snapshots) {
    if (row.date <= cutoff) prior = row;
  }
  if (prior.date === latest.date) prior = snapshots[Math.max(0, snapshots.length - 2)];
  return { cents: latest.netWorthCents - prior.netWorthCents, from: prior.date };
}

export function priceDrift(expectedCents: number, actualCents: number) {
  if (expectedCents <= 0) return null;
  const diff = actualCents - expectedCents;
  if (Math.abs(diff) < 100) return null;
  if (Math.abs(diff) / expectedCents < 0.08) return null;
  return diff;
}

export function merchantKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Stable merchant stem for rules, so store numbers and card suffixes still match. */
export function merchantMatchKey(name: string) {
  const cleaned = name
    .toLowerCase()
    .replace(/[#*]+\s*[a-z0-9]+/g, " ")
    .replace(/\b\d{3,}\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length >= 3) return cleaned;
  return merchantKey(name);
}
