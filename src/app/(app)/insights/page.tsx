"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MoneyText } from "@/components/MoneyText";
import { MonthNav } from "@/components/MonthNav";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageError, PageSkeleton } from "@/components/ui/PageShell";
import { SpendMix } from "@/components/SpendMix";
import { SummaryCard } from "@/components/ui/SummaryCard";
import { activityHref } from "@/lib/activity";
import { monthRange, shortDate, yearMonth } from "@/lib/dates";
import { shelfColor } from "@/lib/palette";
import { formatMoney } from "@/lib/money";
import { useQuery } from "@/lib/use-query";

type Report = {
  year: number;
  month: number;
  incomeCents: number;
  spendingCents: number;
  usualSpentCents?: number | null;
  pendingCents?: number;
  byCategory: { id: string; name: string; cents: number; color: string; avgCents?: number }[];
  byMerchant?: { name: string; cents: number }[];
  netWorth: { netWorthCents: number };
  snapshots: { date: string; netWorthCents: number }[];
};

export default function InsightsPage() {
  const now = yearMonth();
  const [cursor, setCursor] = useState(now);
  const [scrub, setScrub] = useState<{ date: string; cents: number } | null>(null);
  const { data, loading, error, reload } = useQuery<Report>(
    `insights:${cursor.year}-${cursor.month}`,
    `/api/reports?year=${cursor.year}&month=${cursor.month}`,
    { keepPrevious: true },
  );

  const points = useMemo(
    () => (data?.snapshots ?? []).map((row) => ({ date: row.date, cents: row.netWorthCents })),
    [data],
  );
  const latest = points.length ? points[points.length - 1] : null;

  if (!data && loading) return <PageSkeleton title="Insights" rows={5} />;
  if (!data) return <PageError title="Insights" message={error} onRetry={() => void reload()} />;

  const range = monthRange(data.year, data.month);
  const total = data.byCategory.reduce((sum, row) => sum + row.cents, 0) || 1;
  const shown = scrub?.cents ?? latest?.cents ?? data.netWorth.netWorthCents;
  const moved = points.length >= 2 ? points[points.length - 1].cents - points[0].cents : null;
  const movedStatus =
    moved == null || Math.abs(moved) < 100
      ? null
      : moved > 0
        ? { label: `Up ${formatMoney(moved)}`, tone: "good" as const }
        : { label: `Down ${formatMoney(-moved)}`, tone: "bad" as const };
  return (
    <div className="screen">
      <PageHeader title="Insights">
        <MonthNav
          year={data.year}
          month={data.month}
          onChange={(year, month) => {
            setScrub(null);
            setCursor({ year, month });
          }}
        />
      </PageHeader>

      <SummaryCard
        label={scrub ? shortDate(scrub.date) : "Net worth"}
        cents={shown}
        status={scrub ? null : movedStatus}
        points={points}
        chartLabel="Net worth"
        onScrub={(point) => setScrub(point?.date ? { date: point.date, cents: point.cents } : null)}
      />

      <section>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 className="ios-section mb-0">Spending</h2>
          <span className="text-[15px] font-semibold">
            <MoneyText cents={data.spendingCents} />
          </span>
        </div>
        <div className="card">
          <SpendMix
            rows={data.byCategory.map((category) => ({
              key: category.id || category.name,
              cents: category.cents,
              color: shelfColor(category.color),
            }))}
          />
          {data.byCategory.map((category) => {
            const pct = (category.cents / total) * 100;
            return (
            <Link
              key={category.id || category.name}
              href={activityHref({ categoryId: category.id || undefined, start: range.start, end: range.end })}
              className="spend-row"
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="min-w-0">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="spend-dot" style={{ background: shelfColor(category.color) }} />
                    <span className="truncate">{category.name}</span>
                  </span>
                </span>
                <MoneyText className="shrink-0" cents={category.cents} />
              </span>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-[var(--fill)]">
                <span
                  className="spend-bar"
                  style={{ width: `${Math.max(Math.min(100, pct), 2)}%`, background: shelfColor(category.color) }}
                />
              </span>
            </Link>
            );
          })}
          {data.byCategory.length === 0 ? <p className="data-row text-[var(--muted)]">Nothing this month.</p> : null}
        </div>
      </section>

      {data.byMerchant?.length ? (
        <section>
          <h2 className="ios-section">Merchants</h2>
          <div className="card">
            {data.byMerchant.map((merchant) => (
              <Link
                key={merchant.name}
                href={`/merchant?name=${encodeURIComponent(merchant.name)}`}
                className="data-row justify-between gap-3"
              >
                <span className="truncate">{merchant.name}</span>
                <MoneyText className="shrink-0" cents={merchant.cents} />
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
