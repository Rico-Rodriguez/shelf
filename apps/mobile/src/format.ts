import { colors } from "./theme";

export function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function flowMoney(cents: number): { text: string; color: string } {
  if (cents < 0) return { text: `+${money(Math.abs(cents))}`, color: colors.positive };
  return { text: money(cents), color: colors.ink };
}

export function shelfColor(hex: string | null | undefined): string {
  const legacy: Record<string, string> = {
    "#6b8f5e": "#1B7A62",
    "#c4a484": "#8A5A2B",
    "#e07a5f": "#D94A2E",
    "#4a6fa5": "#2F5D8C",
    "#d4847c": "#B04A3A",
    "#e0a84a": "#C47A1A",
    "#7ba3a0": "#3D6B5A",
    "#8b6b9a": "#6B4F9A",
    "#8b7355": "#5C6570",
    "#9a8b7a": "#8B939E",
  };
  if (!hex) return "#5C6570";
  return legacy[hex.trim().toLowerCase()] ?? hex;
}

export function signed(cents: number): string {
  if (cents > 0) return `+${money(cents)}`;
  if (cents < 0) return `-${money(Math.abs(cents))}`;
  return money(0);
}

export function outflow(cents: number): string {
  return signed(-cents);
}

export function daysLeftInMonth(now = new Date()): number {
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.max(1, last - now.getDate() + 1);
}

export function todayISO(): string {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function deviceYearMonth(date = new Date()) {
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function dashboardPath(date = new Date()) {
  const { year, month } = deviceYearMonth(date);
  return `/api/dashboard?year=${year}&month=${month}`;
}

export function dayLabel(iso: string): string {
  const today = todayISO();
  if (iso === today) return "Today";
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yMonth = String(yesterday.getMonth() + 1).padStart(2, "0");
  const yDay = String(yesterday.getDate()).padStart(2, "0");
  if (iso === `${yesterday.getFullYear()}-${yMonth}-${yDay}`) return "Yesterday";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

export function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function inDaysPhrase(iso: string): string {
  const today = new Date(`${todayISO()}T12:00:00`).getTime();
  const then = new Date(`${iso}T12:00:00`).getTime();
  const days = Math.round((then - today) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

export function categorizeLabel(count: number): string {
  if (count === 1) return "1 purchase to categorize";
  return `${count > 99 ? "99+" : count} purchases to categorize`;
}

export function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function shortMonthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const date = new Date(year, month - 1 + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

/** Month key `2026-03` or quarter key `2026-Q2` to an inclusive date range. */
export function periodRange(key: string): { start: string; end: string } | null {
  const month = /^(\d{4})-(\d{2})$/.exec(key);
  if (month) return monthRange(Number(month[1]), Number(month[2]));
  const quarter = /^(\d{4})-Q([1-4])$/.exec(key);
  if (!quarter) return null;
  const year = Number(quarter[1]);
  const startMonth = (Number(quarter[2]) - 1) * 3 + 1;
  return { start: monthRange(year, startMonth).start, end: monthRange(year, startMonth + 2).end };
}

export function monthRange(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { start, end };
}

export function isLiability(type: string): boolean {
  return type === "credit" || type === "loan";
}

export type NetWorthAccount = {
  currentBalanceCents: number;
  type: string;
  isHidden?: boolean;
  includeInNetWorth?: boolean;
};

/** Same net-worth total Insights uses: skip hidden accounts and accounts left out of net worth. */
export function netWorthCents(accounts: NetWorthAccount[]): number {
  let assets = 0;
  let liabilities = 0;
  for (const account of accounts) {
    if (account.isHidden || account.includeInNetWorth === false) continue;
    if (isLiability(account.type)) liabilities += Math.abs(account.currentBalanceCents);
    else assets += account.currentBalanceCents;
  }
  return assets - liabilities;
}

/** Pace versus today. Expected spend is the plan times how far the month has gone. */
export function budgetPace(
  spentCents: number,
  plannedCents: number,
  date = new Date(),
): { label: "Ahead" | "Behind" | "Over"; tone: "good" | "warn" | "bad" } {
  const days = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const day = Math.min(Math.max(date.getDate(), 1), days);
  const expected = plannedCents * (day / days);
  if (plannedCents > 0 && spentCents > plannedCents) return { label: "Over", tone: "bad" };
  if (spentCents > expected) return { label: "Behind", tone: "warn" };
  return { label: "Ahead", tone: "good" };
}

export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Move a due date by whole months and clamp to the last day of the target month. */
export function addCalendarMonths(iso: string, months: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const absolute = year * 12 + monthIndex + months;
  const nextYear = Math.floor(absolute / 12);
  const nextMonth = ((absolute % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(nextYear, nextMonth + 1, 0)).getUTCDate();
  const clamped = Math.min(day, lastDay);
  return `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`;
}

/** Next due date after marking a bill paid. Matches the server's cadence step. */
export function advanceDueDate(due: string, cadence: string): string {
  if (cadence === "weekly") return addDays(due, 7);
  if (cadence === "biweekly") return addDays(due, 14);
  if (cadence === "quarterly") return addCalendarMonths(due, 3);
  if (cadence === "yearly") return addCalendarMonths(due, 12);
  return addCalendarMonths(due, 1);
}

export function monthlyNeedCents(remainingCents: number, targetDate: string | null, today = todayISO()): number | null {
  if (!targetDate || remainingCents <= 0) return null;
  if (targetDate < today) return remainingCents;
  const a = new Date(`${today}T12:00:00`);
  const b = new Date(`${targetDate}T12:00:00`);
  const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  return Math.ceil(remainingCents / (months > 0 ? months : 1));
}

const CADENCE_DAYS: Record<string, number> = {
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

export function annualizedCents(amountCents: number, cadence: string): number {
  return amountCents * (ANNUAL[cadence] ?? 12);
}

/** Every date this cadence lands inside the month, stepping from an anchor the same way bills advance. */
export function occurrencesInMonth(anchor: string, cadence: string, year: number, month: number): string[] {
  const step = CADENCE_DAYS[cadence] ?? 30;
  const { start, end } = monthRange(year, month);
  let cursor = anchor;
  let guard = 0;
  while (cursor > start && guard < 500) {
    cursor = addDays(cursor, -step);
    guard += 1;
  }
  const hits: string[] = [];
  while (cursor <= end && guard < 1000) {
    if (cursor >= start) hits.push(cursor);
    cursor = addDays(cursor, step);
    guard += 1;
  }
  return hits;
}

/** Merchant key for rules. Lowercase, strip punctuation, collapse spaces, and drop one trailing " - {place}". Keep this in step with src/lib/plan.ts. */
export function merchantMatchKey(name: string): string {
  const withoutPlace = name.replace(/\s+-\s+[^-]+$/, "").trim();
  return withoutPlace
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Same payee when the keys match, or they share a word-boundary prefix of at least two words. A single word does not glue longer names together. */
export function sameMerchant(a: string, b: string): boolean {
  const left = merchantMatchKey(a).split(" ").filter(Boolean);
  const right = merchantMatchKey(b).split(" ").filter(Boolean);
  if (!left.length || !right.length) return false;
  let shared = 0;
  const limit = Math.min(left.length, right.length);
  while (shared < limit && left[shared] === right[shared]) shared += 1;
  if (shared === left.length && shared === right.length) return true;
  return shared >= 2;
}

export function payoffMonths(balanceCents: number, aprPercent: number, paymentCents: number): number | null {
  const balance = Math.abs(balanceCents);
  if (balance <= 0 || paymentCents <= 0) return null;
  const rate = aprPercent / 100 / 12;
  if (rate <= 0) return Math.ceil(balance / paymentCents);
  if (paymentCents <= balance * rate) return null;
  const months = -Math.log(1 - (rate * balance) / paymentCents) / Math.log(1 + rate);
  if (!Number.isFinite(months) || months <= 0) return null;
  return Math.ceil(months);
}

export function versusShort(spentCents: number, usualCents: number | null): string | null {
  if (usualCents == null) return null;
  const delta = spentCents - usualCents;
  if (Math.abs(delta) < 100) return "In line with usual";
  if (delta > 0) return `${money(delta)} above usual`;
  return `${money(-delta)} under usual`;
}

export function mediumDate(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("en-US", sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

export function goalPace(goal: {
  targetCents: number;
  targetDate: string | null;
  progressCents: number;
  remainingCents: number;
  createdAt?: string | null;
}): { label: string; tone: "on" | "behind" | "ahead" | "muted" } {
  if (goal.remainingCents <= 0 && goal.targetCents > 0) return { label: "Complete", tone: "ahead" };
  if (!goal.targetDate || goal.targetCents <= 0) {
    return { label: goal.remainingCents > 0 ? "Open" : "Set a date", tone: "muted" };
  }
  const end = new Date(`${goal.targetDate}T12:00:00`).getTime();
  if (goal.remainingCents > 0 && end < Date.now()) return { label: "Behind", tone: "behind" };
  const start = goal.createdAt ? new Date(goal.createdAt).getTime() : end;
  const span = Math.max(end - start, 1);
  const elapsed = Math.min(Math.max(Date.now() - start, 0), span);
  const expected = goal.targetCents * (elapsed / span);
  const slack = Math.max(goal.targetCents * 0.05, 100);
  if (goal.progressCents > expected + slack) return { label: "Ahead", tone: "ahead" };
  if (goal.progressCents < expected - slack) return { label: "Behind", tone: "behind" };
  return { label: "On track", tone: "on" };
}
