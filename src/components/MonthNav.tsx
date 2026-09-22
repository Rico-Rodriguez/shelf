"use client";

import { addMonths, monthName } from "@/lib/dates";

export function MonthNav({
  year,
  month,
  onChange,
}: {
  year: number;
  month: number;
  onChange: (year: number, month: number) => void;
}) {
  const prev = addMonths(year, month, -1);
  const next = addMonths(year, month, 1);
  return (
    <div className="flex items-center gap-2">
      <button
        className="ios-icon-btn size-11 text-[22px] text-[var(--ink)]"
        type="button"
        onClick={() => onChange(prev.year, prev.month)}
        aria-label="Previous month"
      >
        ‹
      </button>
      <span className="min-w-36 text-center text-[17px] font-semibold tracking-[-0.41px]">{monthName(year, month)}</span>
      <button
        className="ios-icon-btn size-11 text-[22px] text-[var(--ink)]"
        type="button"
        onClick={() => onChange(next.year, next.month)}
        aria-label="Next month"
      >
        ›
      </button>
    </div>
  );
}
