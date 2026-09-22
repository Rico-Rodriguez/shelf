"use client";

import { useState } from "react";
import Link from "next/link";
import { MoneyText } from "@/components/MoneyText";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageError, PageShell, PageSkeleton } from "@/components/ui/PageShell";
import { SummaryCard } from "@/components/ui/SummaryCard";
import { activityHref } from "@/lib/activity";
import { api } from "@/lib/client";
import { dayLabel, inDaysPhrase, monthRange, todayISO, yearMonth } from "@/lib/dates";
import { shelfColor } from "@/lib/palette";
import { versusPhrase } from "@/lib/voice";
import { invalidateQueries, useQuery } from "@/lib/use-query";

type Dash = {
  cashFlow: { incomeCents: number; spendingCents: number; savedCents: number };
  budget: { plannedCents: number; spentCents: number; remainingCents: number; mode: string };
  unreviewed: { count: number };
  recurring: { id: string; merchantName: string; amountCents: number; nextDate: string; isIncome: boolean }[];
  accountCount: number;
  transactions: { id: string; name: string }[];
  safeToSpend?: {
    cents: number;
    incomeCents?: number;
    committedCents?: number;
    goalsCents?: number;
    spentCents?: number;
    pendingCents?: number;
  };
  safeSeries?: { date: string; cents: number }[];
  spending?: { id: string; name: string; cents: number; color: string }[];
  usual?: { deltaCents: number | null };
  suggestedSubscriptions?: { merchantName: string }[];
};

export default function HomePage() {
  const { data: dash, loading, refreshing, error, reload } = useQuery<Dash>("dashboard", "/api/dashboard");
  const [scrub, setScrub] = useState<{ date: string; cents: number } | null>(null);
  const [seeding, setSeeding] = useState(false);

  if (!dash && loading) return <PageSkeleton variant="home" />;
  if (!dash) return <PageError title="Home" message={error} onRetry={() => void reload()} />;

  const now = yearMonth();
  const range = monthRange(now.year, now.month);
  const hero = dash.safeToSpend?.cents ?? dash.budget.remainingCents;
  const shown = scrub?.cents ?? hero;
  const pending = dash.safeToSpend?.pendingCents ?? 0;
  const today = todayISO();
  const next = dash.recurring.find((row) => row.nextDate >= today);
  const bills = dash.recurring.filter((row) => !row.isIncome && row.nextDate >= today).slice(0, 4);
  const series = dash.safeSeries ?? [];
  const usualLine = versusPhrase(dash.usual?.deltaCents ?? null, "Purchases");
  const status = next
    ? {
        label: next.isIncome ? `Payday ${inDaysPhrase(next.nextDate)}` : `Next · ${next.merchantName} ${inDaysPhrase(next.nextDate)}`,
        tone: "neutral" as const,
      }
    : null;
  const goalsCents = dash.safeToSpend?.goalsCents ?? 0;
  const categories = (dash.spending ?? []).filter((row) => row.cents > 0);
  const spendTotal = categories.reduce((sum, row) => sum + row.cents, 0) || 1;
  const suggestions = dash.suggestedSubscriptions?.length ?? 0;

  async function loadSample() {
    setSeeding(true);
    try {
      await api("/api/demo/seed", { method: "POST" });
      invalidateQueries();
      reload();
    } finally {
      setSeeding(false);
    }
  }

  return (
    <PageShell refreshing={refreshing}>
      <div className="space-y-6">
        <SummaryCard
          className="is-hero"
          label={scrub ? dayLabel(scrub.date) : "Safe to spend"}
          cents={shown}
          signed={shown < 0}
          status={scrub ? null : status}
          points={series}
          chartLabel="Safe to spend through the month"
          onScrub={(point) => setScrub(point?.date ? { date: point.date, cents: point.cents } : null)}
          note={
            scrub ? null : (
              <>
                <span className="safe-facts">
                  <span>
                    <span className="safe-kicker">Income</span>
                    <MoneyText cents={dash.safeToSpend?.incomeCents ?? dash.cashFlow.incomeCents} />
                  </span>
                  <span>
                    <span className="safe-kicker">{goalsCents > 0 ? "Bills & goals" : "Bills"}</span>
                    <MoneyText cents={(dash.safeToSpend?.committedCents ?? 0) + goalsCents} />
                  </span>
                  <span>
                    <span className="safe-kicker">Purchases</span>
                    <MoneyText cents={dash.safeToSpend?.spentCents ?? dash.cashFlow.spendingCents} />
                  </span>
                </span>
                {usualLine || pending > 0 ? (
                  <span className="safe-aside">
                    {usualLine}
                    {usualLine && pending > 0 ? " " : null}
                    {pending > 0 ? (
                      <>
                        Pending <MoneyText cents={pending} /> isn’t counted yet.
                      </>
                    ) : null}
                  </span>
                ) : null}
              </>
            )
          }
        />

        {dash.accountCount === 0 && dash.transactions.length === 0 ? (
          <EmptyState
            title="Start with one account"
            action={
              <span className="flex flex-wrap items-center justify-center gap-3">
                <Link href="/accounts" className="shelf-btn">
                  Add an account
                </Link>
                <button className="shelf-btn secondary" type="button" disabled={seeding} onClick={() => void loadSample()}>
                  {seeding ? "Loading…" : "Load sample data"}
                </button>
              </span>
            }
          >
            Connect a bank, add a balance, or load sample data to see this month.
          </EmptyState>
        ) : (
          <>
            {dash.unreviewed.count > 0 ? (
              <Link href={activityHref({ reviewed: "false", focus: "1" })} className="review-banner">
                <span>
                  <strong>
                    {dash.unreviewed.count} to review
                  </strong>
                  <span>New purchases are waiting for a category.</span>
                </span>
                <span className="text-btn shrink-0">Review</span>
              </Link>
            ) : null}

            {bills.length > 0 || suggestions > 0 ? (
              <section>
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className="ios-section mb-0">Coming up</h2>
                  <Link href="/recurring" className="text-btn">
                    Bills
                  </Link>
                </div>
                <div className="card">
                  {bills.map((bill) => (
                    <Link key={bill.id} href="/recurring" className="data-row justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{bill.merchantName}</span>
                        <span className="block text-[12px] text-[var(--tertiary)]">{inDaysPhrase(bill.nextDate)}</span>
                      </span>
                      <MoneyText className="shrink-0" cents={bill.amountCents} />
                    </Link>
                  ))}
                  {suggestions > 0 ? (
                    <Link href="/recurring" className="data-row justify-between gap-3">
                      <span>{suggestions === 1 ? "1 charge looks like a bill" : `${suggestions} charges look like bills`}</span>
                      <span className="text-btn">Check</span>
                    </Link>
                  ) : null}
                </div>
              </section>
            ) : null}
          </>
        )}

        {categories.length > 0 ? (
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="ios-section mb-0">Where it went</h2>
              <Link href="/insights" className="text-btn">
                Insights
              </Link>
            </div>
            <div className="card">
              {categories.map((category) => {
                const pct = (category.cents / spendTotal) * 100;
                const pctLabel = pct < 1 ? "<1%" : `${Math.round(pct)}%`;
                return (
                  <Link
                    key={category.id || category.name}
                    href={activityHref({ categoryId: category.id || undefined, start: range.start, end: range.end })}
                    className="spend-row"
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="spend-dot" style={{ background: shelfColor(category.color) }} />
                        <span className="truncate">{category.name}</span>
                        <span className="shrink-0 text-[13px] text-[var(--tertiary)]">{pctLabel}</span>
                      </span>
                      <MoneyText className="shrink-0" cents={category.cents} />
                    </span>
                    <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-[var(--fill)]">
                      <span
                        className="spend-bar"
                        style={{ width: `${Math.max(pct, 2)}%`, background: shelfColor(category.color) }}
                      />
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : dash.cashFlow.spendingCents > 0 ? (
          <div className="card">
            <Link href={activityHref({ start: range.start, end: range.end })} className="data-row justify-between gap-3">
              <span>Spent this month</span>
              <MoneyText className="shrink-0" cents={dash.cashFlow.spendingCents} />
            </Link>
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}
