"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { MerchantMark } from "@/components/MerchantMark";
import { MoneyText } from "@/components/MoneyText";
import { useConfirmFlash } from "@/components/ConfirmFlash";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageError, PageShell, PageSkeleton } from "@/components/ui/PageShell";
import { SpendMix } from "@/components/SpendMix";
import { SummaryCard } from "@/components/ui/SummaryCard";
import { activityHref } from "@/lib/activity";
import { api } from "@/lib/client";
import { dayLabel, inDaysPhrase, monthRange, todayISO, yearMonth } from "@/lib/dates";
import { shelfColor } from "@/lib/palette";
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
    committedFrom?: "plan" | "bills";
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
  const { flash, run } = useConfirmFlash();

  if (!dash && loading) return <PageSkeleton variant="home" />;
  if (!dash) return <PageError title="Home" message={error} onRetry={() => void reload()} />;

  const now = yearMonth();
  const range = monthRange(now.year, now.month);
  const hero = dash.safeToSpend?.cents ?? dash.budget.remainingCents;
  const shown = scrub?.cents ?? hero;
  const today = todayISO();
  const bills = dash.recurring.filter((row) => !row.isIncome && row.nextDate >= today).slice(0, 4);
  const series = dash.safeSeries ?? [];
  const goalsCents = dash.safeToSpend?.goalsCents ?? 0;
  const committedFromPlan = dash.safeToSpend?.committedFrom === "plan";
  const committedLabel = committedFromPlan ? (goalsCents > 0 ? "Budgeted & goals" : "Budgeted") : goalsCents > 0 ? "Bills & goals" : "Bills";
  const categories = (dash.spending ?? []).filter((row) => row.cents > 0);
  const restCents = categories.slice(5).reduce((sum, row) => sum + row.cents, 0);
  const spendRows =
    restCents > 0
      ? [...categories.slice(0, 5), { id: "rest", name: "Everything else", cents: restCents, color: "#8B939E" }]
      : categories;
  const barMax = Math.max(...spendRows.map((row) => row.cents), 1);
  const suggestions = dash.suggestedSubscriptions?.length ?? 0;

  async function loadSample() {
    setSeeding(true);
    try {
      await run(async () => {
        await api("/api/demo/seed", { method: "POST" });
      });
      invalidateQueries();
      reload();
    } finally {
      setSeeding(false);
    }
  }

  return (
    <PageShell refreshing={refreshing}>
      <div className="screen">
        {flash}
        <SummaryCard
          className="is-hero"
          label={scrub ? dayLabel(scrub.date) : "Safe to spend"}
          cents={shown}
          signed={shown < 0}
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
                    <span className="safe-kicker">{committedLabel}</span>
                    <MoneyText cents={(dash.safeToSpend?.committedCents ?? 0) + goalsCents} />
                  </span>
                  <span>
                    <span className="safe-kicker">Day to day</span>
                    <MoneyText cents={dash.safeToSpend?.spentCents ?? dash.cashFlow.spendingCents} />
                  </span>
                </span>
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
          />
        ) : (
          <>
            {dash.unreviewed.count > 0 ? (
              <Link href={activityHref({ reviewed: "false", focus: "1" })} className="review-banner">
                <span className="nav-count">{dash.unreviewed.count > 99 ? "99+" : dash.unreviewed.count}</span>
                <span className="min-w-0 flex-1">To review</span>
                <Icon name="chevron" size={18} />
              </Link>
            ) : null}

            {bills.length > 0 || suggestions > 0 || categories.length > 0 ? (
              <div className="home-split">
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
                          <MerchantMark name={bill.merchantName} />
                          <span className="min-w-0 flex-1">
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

                {categories.length > 0 ? (
                  <section>
                    <div className="mb-2 flex items-baseline justify-between gap-3">
                      <h2 className="ios-section mb-0">Where it went</h2>
                      <span className="flex items-baseline gap-3">
                        <MoneyText className="text-[15px] font-semibold" cents={dash.cashFlow.spendingCents} />
                        <Link href="/insights" className="text-btn">
                          Insights
                        </Link>
                      </span>
                    </div>
                    <div className="card">
                      <SpendMix
                        rows={spendRows.map((category) => ({
                          key: category.id || category.name,
                          cents: category.cents,
                          color: shelfColor(category.color),
                        }))}
                      />
                      {spendRows.map((category) => {
                        const pct = (category.cents / barMax) * 100;
                        return (
                          <Link
                            key={category.id || category.name}
                            href={category.id === "rest" ? "/insights" : activityHref({ categoryId: category.id || undefined, start: range.start, end: range.end })}
                            className="spend-row"
                          >
                            <span className="flex items-baseline justify-between gap-3">
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="spend-dot" style={{ background: shelfColor(category.color) }} />
                                <span className="truncate">{category.name}</span>
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
            ) : null}
          </>
        )}
      </div>
    </PageShell>
  );
}
