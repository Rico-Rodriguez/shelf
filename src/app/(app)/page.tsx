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
import { dayLabel, inDaysPhrase, monthRange, shortDate, todayISO, yearMonth } from "@/lib/dates";
import { shelfColor } from "@/lib/palette";
import { invalidateQueries, useQuery } from "@/lib/use-query";
import { categorizeLabel } from "@/lib/voice";

type Dash = {
  cashFlow: { incomeCents: number; spendingCents: number; savedCents: number };
  budget: { plannedCents: number; spentCents: number; remainingCents: number };
  unreviewed: { count: number };
  recurring: { id: string; merchantName: string; amountCents: number; nextDate: string; isIncome: boolean }[];
  accountCount: number;
  transactions: {
    id: string;
    name: string;
    merchantName: string | null;
    amountCents: number;
    date: string;
    pending: boolean;
    category: { name: string; color: string } | null;
    accountName: string | null;
  }[];
  spendSeries?: { date: string; cents: number }[];
  spending?: { id: string; name: string; cents: number; color: string }[];
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
  const shown = scrub?.cents ?? dash.cashFlow.spendingCents;
  const today = todayISO();
  const bills = dash.recurring.filter((row) => !row.isIncome && row.nextDate >= today).slice(0, 4);
  const series = dash.spendSeries ?? [];
  const categories = (dash.spending ?? []).filter((row) => row.cents > 0);
  const restCents = categories.slice(5).reduce((sum, row) => sum + row.cents, 0);
  const spendRows =
    restCents > 0
      ? [...categories.slice(0, 5), { id: "rest", name: "Everything else", cents: restCents, color: "#8B939E" }]
      : categories;
  const suggestions = dash.suggestedSubscriptions?.length ?? 0;
  const latest = dash.transactions.slice(0, 4);
  const showCash = dash.cashFlow.incomeCents !== 0 || dash.cashFlow.spendingCents !== 0;
  const hasPlan = dash.budget.plannedCents > 0;
  const left = dash.budget.remainingCents;
  const overPlan = hasPlan && left < 0;

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
          label={scrub ? dayLabel(scrub.date) : "Spent this month"}
          cents={shown}
          points={series}
          chartLabel="Spending this month"
          onScrub={(point) => setScrub(point?.date ? { date: point.date, cents: point.cents } : null)}
          note={
            scrub || !showCash ? null : (
              <span className="safe-facts">
                <span>
                  <span className="safe-kicker">Income</span>
                  <MoneyText animate cents={dash.cashFlow.incomeCents} />
                </span>
                <span>
                  <span className="safe-kicker">{dash.cashFlow.savedCents < 0 ? "Over income" : "Saved"}</span>
                  <MoneyText
                    animate
                    cents={Math.abs(dash.cashFlow.savedCents)}
                    className={dash.cashFlow.savedCents < 0 ? "text-[var(--danger)]" : "text-[var(--positive)]"}
                  />
                </span>
              </span>
            )
          }
        />

        {hasPlan ? (
          <Link href="/budget" className="plan-left">
            <span>{overPlan ? "Over this month" : "Left this month"}</span>
            <MoneyText
              animate
              cents={Math.abs(left)}
              className={overPlan ? "text-[var(--danger)]" : "text-[var(--positive)]"}
            />
          </Link>
        ) : null}

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
                <span className="min-w-0 flex-1">{categorizeLabel(dash.unreviewed.count)}</span>
                <Icon name="chevron" size={18} />
              </Link>
            ) : null}

            {latest.length > 0 ? (
              <section>
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className="ios-section mb-0">Latest</h2>
                  <Link href="/transactions" className="text-btn">
                    Activity
                  </Link>
                </div>
                <div className="card">
                  {latest.map((tx) => {
                    const when = dayLabel(tx.date);
                    const whenShort = when === "Today" || when === "Yesterday" ? when : shortDate(tx.date);
                    return (
                      <Link
                        key={tx.id}
                        href={activityHref({ q: tx.merchantName || tx.name })}
                        className="data-row justify-between gap-3"
                      >
                        <MerchantMark name={tx.merchantName || tx.name} color={tx.category?.color} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{tx.merchantName || tx.name}</span>
                          <span className="block truncate text-[12px] text-[var(--tertiary)]">
                            {[whenShort, tx.category?.name, tx.pending ? "Pending" : ""].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <MoneyText className="shrink-0" cents={tx.amountCents} flow />
                      </Link>
                    );
                  })}
                </div>
              </section>
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
                          Compare
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
                      {spendRows.map((category) => (
                        <Link
                          key={category.id || category.name}
                          href={category.id === "rest" ? "/insights" : activityHref({ categoryId: category.id || undefined, start: range.start, end: range.end })}
                          className="data-row justify-between gap-3"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="spend-dot" style={{ background: shelfColor(category.color) }} />
                            <span className="truncate">{category.name}</span>
                          </span>
                          <MoneyText className="shrink-0" cents={category.cents} />
                        </Link>
                      ))}
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
