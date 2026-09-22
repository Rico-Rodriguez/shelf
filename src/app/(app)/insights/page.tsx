"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MoneyText } from "@/components/MoneyText";
import { MonthNav } from "@/components/MonthNav";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/PageShell";
import { SummaryCard } from "@/components/ui/SummaryCard";
import { activityHref } from "@/lib/activity";
import { monthRange, shortDate, yearMonth } from "@/lib/dates";
import { shelfColor } from "@/lib/palette";
import { formatMoney } from "@/lib/money";
import { useQuery } from "@/lib/use-query";
import { versusPhrase, versusShort } from "@/lib/voice";

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
  const { data, loading } = useQuery<Report>(
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
  if (!data) return <PageSkeleton title="Insights" rows={5} />;

  const range = monthRange(data.year, data.month);
  const max = Math.max(...data.byCategory.map((row) => row.cents), 1);
  const shown = scrub?.cents ?? latest?.cents ?? data.netWorth.netWorthCents;
  const moved = points.length >= 2 ? points[points.length - 1].cents - points[0].cents : null;
  const movedStatus =
    moved == null || Math.abs(moved) < 100
      ? null
      : moved > 0
        ? { label: `Up ${formatMoney(moved)}`, tone: "good" as const }
        : { label: `Down ${formatMoney(-moved)}`, tone: "bad" as const };
  const spendingNote = versusPhrase(data.usualSpentCents == null ? null : data.spendingCents - data.usualSpentCents);

  return (
    <div className="space-y-6">
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
        footer={
          <>
            Spent <MoneyText cents={data.spendingCents} /> this month
          </>
        }
        detail={
          spendingNote || data.pendingCents ? (
            <>
              {spendingNote}
              {data.pendingCents ? (
                <>
                  {spendingNote ? " " : null}
                  Pending <MoneyText cents={data.pendingCents} /> is not included.
                </>
              ) : null}
            </>
          ) : null
        }
      />

      <section>
        <h2 className="ios-section">Spending</h2>
        <div className="card">
          {data.byCategory.map((category) => (
            <Link
              key={category.id || category.name}
              href={activityHref({ categoryId: category.id || undefined, start: range.start, end: range.end })}
              className="block border-b border-[var(--line)] px-4 py-3 last:border-0"
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate">{category.name}</span>
                  {versusShort(category.cents, category.avgCents || null) ? (
                    <span className="mt-0.5 block text-[13px] text-[var(--muted)]">{versusShort(category.cents, category.avgCents || null)}</span>
                  ) : null}
                </span>
                <MoneyText className="shrink-0" cents={category.cents} />
              </span>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-[var(--fill)]">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${Math.min(100, (category.cents / max) * 100)}%`, background: shelfColor(category.color) }}
                />
              </span>
            </Link>
          ))}
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
