import { addDays, monthRange, shiftMonth, shortDate, todayISO } from "./format";
import type { TrendPoint } from "./trend";

export type Range = "1W" | "1M" | "3M" | "1Y";
export const RANGES: Range[] = ["1W", "1M", "3M", "1Y"];

/** Running totals by date, as the dashboard sends them. */
export type Running = { date: string; cents: number }[];
/** Spending per month, keyed "2026-11". */
export type Monthly = Record<string, number>;

export type Period = {
  /** "Spent in November", "Spent in the last 7 days". */
  title: string;
  totalCents: number;
  points: TrendPoint[];
  compare: { at: number; cents: number }[];
  /** This period minus the last one at the same point. Null when there is nothing to compare. */
  deltaCents: number | null;
  /** "this point in October", "last week". */
  versus: string;
};

const MONTH = (year: number, month: number) => new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long" });
const SHORT = (year: number, month: number) => new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "short" });
const key = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;
const daysIn = (year: number, month: number) => new Date(year, month, 0).getDate();
const dayOf = (iso: string) => Number(iso.slice(8, 10));

/** Each day's spending, from one or more months of running totals. */
export function dailyFromRunning(...months: Running[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const series of months) {
    let before = 0;
    for (const point of series) {
      out.set(point.date, (out.get(point.date) ?? 0) + Math.max(0, point.cents - before));
      before = point.cents;
    }
  }
  return out;
}

/** The running total on a given day of the month (0 before the first purchase). */
function runningOn(series: Running, day: number): number {
  let cents = 0;
  for (const point of series) {
    if (dayOf(point.date) <= day) cents = point.cents;
  }
  return cents;
}

/** Value of a cumulative line at a position, reading linearly between points. */
export function valueAt(line: { at: number; cents: number }[], at: number): number {
  if (!line.length) return 0;
  if (at <= line[0].at) return line[0].cents;
  for (let i = 1; i < line.length; i++) {
    if (at <= line[i].at) {
      const a = line[i - 1];
      const b = line[i];
      const span = b.at - a.at || 1;
      return a.cents + ((at - a.at) / span) * (b.cents - a.cents);
    }
  }
  return line[line.length - 1].cents;
}

export function buildPeriod(
  range: Range,
  input: { thisMonth: Running; lastMonth: Running | null; monthly: Monthly | null; thisMonthTotal: number },
  today = todayISO(),
): Period {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const day = dayOf(today);
  const prev = shiftMonth(year, month, -1);

  if (range === "1W") {
    const daily = dailyFromRunning(input.lastMonth ?? [], input.thisMonth);
    const span = 7;
    const points: TrendPoint[] = [{ at: 0, cents: 0, label: shortDate(addDays(today, -6)) }];
    let run = 0;
    for (let i = 0; i < span; i++) {
      const date = addDays(today, i - 6);
      run += daily.get(date) ?? 0;
      points.push({ at: (i + 1) / span, cents: run, label: `${i === 6 ? "Today" : new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}` });
    }
    const compare = [{ at: 0, cents: 0 }];
    let before = 0;
    for (let i = 0; i < span; i++) {
      before += daily.get(addDays(today, i - 13)) ?? 0;
      compare.push({ at: (i + 1) / span, cents: before });
    }
    const hasHistory = Boolean(input.lastMonth) || day > 13;
    return {
      title: "Spent in the last 7 days",
      totalCents: run,
      points,
      compare: hasHistory ? compare : [],
      deltaCents: hasHistory ? run - before : null,
      versus: "the 7 days before",
    };
  }

  if (range === "1M") {
    const days = daysIn(year, month);
    const points: TrendPoint[] = [{ at: 0, cents: 0, label: shortDate(monthRange(year, month).start) }];
    for (let d = 1; d <= day; d++) {
      const date = `${key(year, month)}-${String(d).padStart(2, "0")}`;
      points.push({ at: d / days, cents: runningOn(input.thisMonth, d), label: d === day ? "Today" : shortDate(date) });
    }
    // The headline uses the dashboard total, which also counts pending purchases.
    const total = Math.max(input.thisMonthTotal, points[points.length - 1].cents);
    points[points.length - 1] = { ...points[points.length - 1], cents: total };
    const lastDays = daysIn(prev.year, prev.month);
    const compare = input.lastMonth
      ? [{ at: 0, cents: 0 }, ...Array.from({ length: lastDays }, (_, i) => ({ at: (i + 1) / lastDays, cents: runningOn(input.lastMonth ?? [], i + 1) }))]
      : [];
    const then = input.lastMonth ? runningOn(input.lastMonth, Math.min(day, lastDays)) : null;
    return {
      title: `Spent in ${MONTH(year, month)}`,
      totalCents: total,
      points,
      compare,
      deltaCents: then == null ? null : total - then,
      versus: `this point in ${MONTH(prev.year, prev.month)}`,
    };
  }

  // 3M and 1Y read whole months, with this month counted so far.
  const count = range === "3M" ? 3 : 12;
  const monthly = input.monthly ?? {};
  const progress = day / daysIn(year, month);
  const points: TrendPoint[] = [];
  const first = shiftMonth(year, month, -(count - 1));
  points.push({ at: 0, cents: 0, label: `Start of ${SHORT(first.year, first.month)}` });
  let run = 0;
  for (let i = 0; i < count; i++) {
    const m = shiftMonth(first.year, first.month, i);
    const current = i === count - 1;
    run += current ? input.thisMonthTotal : (monthly[key(m.year, m.month)] ?? 0);
    points.push({ at: current ? (i + progress) / count : (i + 1) / count, cents: run, label: current ? "Today" : `End of ${SHORT(m.year, m.month)}` });
  }
  const compare: { at: number; cents: number }[] = [{ at: 0, cents: 0 }];
  let before = 0;
  let known = false;
  for (let i = 0; i < count; i++) {
    const m = shiftMonth(first.year, first.month, i - count);
    const cents = monthly[key(m.year, m.month)];
    if (cents) known = true;
    before += cents ?? 0;
    compare.push({ at: (i + 1) / count, cents: before });
  }
  const at = points[points.length - 1].at;
  return {
    title: range === "3M" ? `Spent since ${MONTH(first.year, first.month)} 1` : "Spent in the last 12 months",
    totalCents: run,
    points,
    compare: known ? compare : [],
    deltaCents: known ? run - Math.round(valueAt(compare, at)) : null,
    versus: range === "3M" ? "the 3 months before" : "the year before",
  };
}

/** Month keys to fetch from cash flow so 1Y can compare with the year before. */
export const MONTHS_OF_HISTORY = 24;
