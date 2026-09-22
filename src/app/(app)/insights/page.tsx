"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MoneyText } from "@/components/MoneyText";
import { MonthNav } from "@/components/MonthNav";
import { ScrubChart } from "@/components/ScrubChart";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/PageShell";
import { api } from "@/lib/client";
import { activityHref } from "@/lib/activity";
import { monthRange, yearMonth } from "@/lib/dates";
import { shelfColor } from "@/lib/palette";
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
  const [data, setData] = useState<Report | null>(null);
  const [scrub, setScrub] = useState<{ date: string; cents: number } | null>(null);

  useEffect(() => {
    let active = true;
    void api<Report>(`/api/reports?year=${cursor.year}&month=${cursor.month}`).then((next) => {
      if (active) setData(next);
    });
    return () => {
      active = false;
    };
  }, [cursor]);

  const points = useMemo(
    () => (data?.snapshots ?? []).map((row) => ({ date: row.date, cents: row.netWorthCents })),
    [data],
  );
  const latest = points.length ? points[points.length - 1] : null;

  if (!data) return <PageSkeleton title="Insights" rows={5} />;

  const range = monthRange(cursor.year, cursor.month);
  const max = Math.max(...data.byCategory.map((row) => row.cents), 1);
  const shown = scrub?.cents ?? latest?.cents ?? data.netWorth.netWorthCents;
  const phrase = versusPhrase(
    data.usualSpentCents == null ? null : data.spendingCents - data.usualSpentCents,
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Insights" subtitle={phrase ?? undefined}>
        <MonthNav year={cursor.year} month={cursor.month} onChange={(year, month) => setCursor({ year, month })} />
      </PageHeader>

      <section>
        <p className="text-[13px] text-[var(--muted)]">{scrub ? scrub.date : "Net worth"}</p>
        <div className="mt-1">
          <MoneyText hero cents={shown} />
        </div>
        <div className="mt-4">
          <ScrubChart points={points} onScrub={setScrub} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-[13px] font-medium text-[var(--muted)]">Spending</h2>
        <div className="card">
          {data.byCategory.map((category) => (
            <Link
              key={category.id || category.name}
              href={activityHref({ categoryId: category.id || undefined, start: range.start, end: range.end })}
              className="block border-b border-[var(--line)] px-4 py-3 last:border-0"
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="truncate">{category.name}</span>
                <MoneyText cents={category.cents} />
              </span>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-[var(--fill)]">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${Math.min(100, (category.cents / max) * 100)}%`, background: shelfColor(category.color) }}
                />
              </span>
              {versusShort(category.cents, category.avgCents ?? null) ? (
                <span className="mt-1 block text-[13px] text-[var(--muted)]">{versusShort(category.cents, category.avgCents ?? null)}</span>
              ) : null}
            </Link>
          ))}
          {data.byCategory.length === 0 ? <p className="data-row text-[var(--muted)]">Nothing this month.</p> : null}
        </div>
        {data.pendingCents ? (
          <p className="mt-2 text-[13px] text-[var(--tertiary)]">
            Pending <MoneyText cents={data.pendingCents} /> is not included.
          </p>
        ) : null}
      </section>

      {data.byMerchant?.length ? (
        <section>
          <h2 className="mb-2 text-[13px] font-medium text-[var(--muted)]">Merchants</h2>
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
