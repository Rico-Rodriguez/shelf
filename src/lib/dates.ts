export function todayISO(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function yearMonth(d = new Date()): { year: number; month: number } {
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function monthRange(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { start, end };
}

export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return todayISO(d);
}

/** Move a calendar day by whole months and clamp to the last day of the target month. */
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

/** Phone month when `year` and `month` are valid. Otherwise the server's current month. */
export function requestedMonth(url: URL): { year: number; month: number } {
  const now = yearMonth();
  const yearRaw = url.searchParams.get("year");
  const monthRaw = url.searchParams.get("month");
  if (yearRaw == null && monthRaw == null) return now;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12 || year < 1970 || year > 9999) {
    return now;
  }
  return { year, month };
}

export function monthName(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function inMonth(iso: string, year: number, month: number): boolean {
  const { start, end } = monthRange(year, month);
  return iso >= start && iso <= end;
}

const CADENCE_DAYS: Record<string, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  quarterly: 91,
  yearly: 365,
};

export function daysFromToday(iso: string, today = todayISO()) {
  const a = new Date(`${today}T12:00:00`).getTime();
  const b = new Date(`${iso}T12:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

export function inDaysPhrase(iso: string, today = todayISO()) {
  const days = daysFromToday(iso, today);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

export function shortDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function mediumDate(iso: string) {
  const date = new Date(`${iso}T12:00:00`);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("en-US", sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

export function dayLabel(iso: string, today = todayISO()): string {
  if (iso === today) return "Today";
  if (iso === addDays(today, -1)) return "Yesterday";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
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
