"use client";

import { useState } from "react";
import Link from "next/link";
import { MerchantMark } from "@/components/MerchantMark";
import { MoneyText } from "@/components/MoneyText";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageError, PageShell, PageSkeleton } from "@/components/ui/PageShell";
import { SummaryCard } from "@/components/ui/SummaryCard";
import { activityHref } from "@/lib/activity";
import { api } from "@/lib/client";
import { dayLabel, inDaysPhrase, monthRange, todayISO, yearMonth } from "@/lib/dates";
import { shelfColor } from "@/lib/palette";
import { versusStatus } from "@/lib/voice";
import { invalidateQueries, useQuery } from "@/lib/use-query";

type Dash = {
  cashFlow: { incomeCents: number; spendingCents: number; savedCents: number };
  budget: { plannedCents: number; spentCents: number; remainingCents: number; mode: string };
  unreviewed: { count: number; amountCents?: number };
  recurring: { id: string; merchantName: string; amountCents: number; nextDate: string; isIncome: boolean }[];
  accountCount: number;
  transactions: {
    id: string;
    name: string;
    merchantName?: string | null;
    amountCents?: number;
    date?: string;
    pending?: boolean;
    category?: { name: string; color?: string | null } | null;
    accountName?: string | null;
  }[];
  netWorth?: { netWorthCents: number };
  netWorthDelta?: { cents: number } | null;
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

function weekdayName(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
}

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
  const usual = versusStatus(dash.usual?.deltaCents ?? null, "usual");
  const status = usual
    ? {
        label: usual.label.startsWith("In line") ? "Spending in line with usual" : `Spending ${usual.label}`,
        tone: usual.tone,
      }
    : next
      ? { label: `${next.isIncome ? "Payday" : next.merchantName} ${weekdayName(next.nextDate)}`, tone: "neutral" as const }
      : null;
  const categories = (dash.spending ?? []).filter((row) => row.cents > 0);
  const maxCategory = Math.max(...categories.map((row) => row.cents), 1);
  const recent = dash.transactions.filter((tx) => tx.date && tx.amountCents != null).slice(0, 4);
  const goalsCents = dash.safeToSpend?.goalsCents ?? 0;
  const billsCents = (dash.safeToSpend?.committedCents ?? 0) + goalsCents;
  const dayToDay = dash.safeToSpend?.spentCents ?? dash.cashFlow.spendingCents;
  const moved = dash.netWorthDelta?.cents ?? null;
  const worth =
    moved == null || Math.abs(moved) < 100
      ? null
      : moved > 0
        ? { label: "Up", cents: moved, tone: "good" }
        : { label: "Down", cents: -moved, tone: "bad" };

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
          label={scrub ? dayLabel(scrub.date) : "Left to spend"}
          cents={shown}
          signed={shown < 0}
          status={scrub ? null : status}
          points={series}
          chartLabel="Left to spend through the month"
          onScrub={(point) => setScrub(point?.date ? { date: point.date, cents: point.cents } : null)}
          footer={
            <span className="safe-facts">
              <span>
                <span className="safe-kicker">Income</span>
                <MoneyText cents={dash.safeToSpend?.incomeCents ?? dash.cashFlow.incomeCents} />
              </span>
              <span>
                <span className="safe-kicker">{goalsCents > 0 ? "Bills & goals" : "Bills"}</span>
                <MoneyText cents={billsCents} />
              </span>
              <span>
                <span className="safe-kicker">Spent</span>
                <MoneyText cents={dayToDay} />
              </span>
            </span>
          }
          detail={
            <>
              Goals <MoneyText cents={dash.safeToSpend?.goalsCents ?? 0} /> are already set aside.
              {pending > 0 ? (
                <>
                  {" "}
                  Pending <MoneyText cents={pending} /> is not counted yet.
                </>
              ) : null}
            </>
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
          <div className="card">
            {dash.unreviewed.count > 0 ? (
              <Link href={activityHref({ reviewed: "false", focus: "1" })} className="data-row justify-between gap-3">
                <span className="min-w-0">
                  <span className="block font-medium">{dash.unreviewed.count} to review</span>
                  {dash.unreviewed.amountCents ? (
                    <span className="block text-[13px] text-[var(--muted)]">
                      <MoneyText cents={dash.unreviewed.amountCents} /> waiting
                    </span>
                  ) : null}
                </span>
                <span className="text-btn">Review</span>
              </Link>
            ) : null}
            <Link href={activityHref({ start: range.start, end: range.end })} className="data-row justify-between gap-3">
              <span>This month</span>
              <MoneyText className="shrink-0" cents={dash.cashFlow.spendingCents} />
            </Link>
            {bills.map((bill) => (
              <Link key={bill.id} href="/recurring" className="data-row justify-between gap-3">
                <span className="truncate">{bill.merchantName}</span>
                <span className="shrink-0 text-[var(--muted)]">
                  {inDaysPhrase(bill.nextDate)} · <MoneyText cents={bill.amountCents} />
                </span>
              </Link>
            ))}
            {dash.suggestedSubscriptions?.length ? (
              <Link href="/recurring" className="data-row justify-between gap-3">
                <span>
                  {dash.suggestedSubscriptions.length} possible subscription{dash.suggestedSubscriptions.length === 1 ? "" : "s"}
                </span>
              </Link>
            ) : null}
          </div>
        )}

        {recent.length > 0 ? (
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="ios-section mb-0">Recent</h2>
              <Link href="/transactions" className="text-btn">
                Activity
              </Link>
            </div>
            <div className="card">
              {recent.map((tx) => (
                <Link key={tx.id} href={activityHref({ q: tx.name })} className="data-row justify-between gap-3">
                  <MerchantMark name={tx.merchantName || tx.name} color={tx.category?.color} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{tx.name}</span>
                    <span className="block truncate text-[13px] text-[var(--muted)]">
                      {tx.date ? dayLabel(tx.date) : ""}
                      {tx.category?.name ? ` · ${tx.category.name}` : ""}
                      {tx.accountName ? ` · ${tx.accountName}` : ""}
                      {tx.pending ? " · Pending" : ""}
                    </span>
                  </span>
                  <MoneyText className="shrink-0" cents={tx.amountCents ?? 0} flow />
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {categories.length > 0 ? (
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="ios-section mb-0">Spending</h2>
              <Link href="/insights" className="text-btn">
                All
              </Link>
            </div>
            <div className="card">
              {categories.map((category) => (
                <Link
                  key={category.id || category.name}
                  href={activityHref({ categoryId: category.id || undefined, start: range.start, end: range.end })}
                  className="block border-b border-[var(--line)] px-4 py-3 last:border-0"
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate">{category.name}</span>
                    <MoneyText className="shrink-0" cents={category.cents} />
                  </span>
                  <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-[var(--fill)]">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${Math.min(100, (category.cents / maxCategory) * 100)}%`, background: shelfColor(category.color) }}
                    />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {dash.netWorth ? (
          <Link href="/insights" className="card data-row justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-[13px] text-[var(--muted)]">Net worth</span>
              <span className="mt-0.5 block text-[22px] font-semibold tracking-[-0.03em]">
                <MoneyText cents={dash.netWorth.netWorthCents} />
              </span>
            </span>
            {worth ? (
              <span className={`summary-status ${worth.tone}`}>
                {worth.label} <MoneyText cents={worth.cents} />
              </span>
            ) : null}
          </Link>
        ) : null}
      </div>
    </PageShell>
  );
}
