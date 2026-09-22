"use client";

import { useState } from "react";
import Link from "next/link";
import { MoneyText } from "@/components/MoneyText";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell, PageSkeleton } from "@/components/ui/PageShell";
import { SummaryCard } from "@/components/ui/SummaryCard";
import { activityHref } from "@/lib/activity";
import { dayLabel, inDaysPhrase, monthName, todayISO, yearMonth } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { versusStatus } from "@/lib/voice";
import { useQuery } from "@/lib/use-query";

type Dash = {
  netWorth: { assetsCents: number; liabilitiesCents: number; netWorthCents: number };
  netWorthDelta?: { cents: number; from: string } | null;
  snapshots?: { date: string; netWorthCents: number }[];
  cashFlow: { incomeCents: number; spendingCents: number; savedCents: number };
  budget: { plannedCents: number; spentCents: number; remainingCents: number; mode: string };
  unreviewed: {
    count: number;
    amountCents: number;
    items: { id: string; name: string; amountCents: number; date: string }[];
  };
  recurring: { id: string; merchantName: string; amountCents: number; nextDate: string; isIncome: boolean }[];
  accountCount: number;
  transactions: { id: string; name: string; amountCents: number; date: string; pending?: boolean; hidden?: boolean }[];
  safeToSpend?: {
    cents: number;
    cashCents?: number;
    billsDueCents?: number;
    planOpenCents?: number;
    pendingCents?: number;
  };
  safeSeries?: { date: string; cents: number }[];
  usual?: { deltaCents: number | null };
};

export default function HomePage() {
  const { data: dash, loading } = useQuery<Dash>("dashboard", "/api/dashboard");
  const [scrub, setScrub] = useState<{ date: string; cents: number } | null>(null);

  if (!dash && loading) return <PageSkeleton title="Safe to spend" rows={4} />;
  if (!dash) return <PageSkeleton title="Safe to spend" rows={4} />;

  const now = yearMonth();
  const hero = dash.safeToSpend?.cents ?? dash.budget.remainingCents;
  const shown = scrub?.cents ?? hero;
  const pending = dash.safeToSpend?.pendingCents ?? 0;
  const today = todayISO();
  const next = dash.recurring.find((row) => row.nextDate >= today);
  const series = dash.safeSeries ?? [];
  const recent = dash.transactions.filter((tx) => !tx.hidden).slice(0, 5);
  const moved = dash.netWorthDelta?.cents ?? null;
  const worthStatus =
    moved == null || Math.abs(moved) < 100
      ? null
      : moved > 0
        ? { label: `Up ${formatMoney(moved)}`, tone: "good" as const }
        : { label: `Down ${formatMoney(-moved)}`, tone: "bad" as const };
  const worthPoints = (dash.snapshots ?? []).map((point) => ({ date: point.date, cents: point.netWorthCents }));

  return (
    <PageShell>
      <div className="space-y-6">
        <PageHeader title="Safe to spend" />

        <SummaryCard
          label={scrub ? dayLabel(scrub.date) : monthName(now.year, now.month)}
          cents={shown}
          status={scrub ? null : versusStatus(dash.usual?.deltaCents ?? null, "usual")}
          points={series}
          chartLabel="Safe to spend through the month"
          onScrub={(point) => setScrub(point?.date ? { date: point.date, cents: point.cents } : null)}
          footer={
            next
              ? `${next.isIncome ? "Payday" : next.merchantName} ${inDaysPhrase(next.nextDate)}`
              : dash.accountCount > 0
                ? "Nothing due in the next few days"
                : null
          }
          footerIcon={next ? "calendar" : undefined}
          detail={
            <>
              Cash <MoneyText cents={dash.safeToSpend?.cashCents ?? 0} />
              {" · "}
              Bills <MoneyText cents={dash.safeToSpend?.billsDueCents ?? 0} />
              {" · "}
              {dash.budget.plannedCents > 0 ? (
                <>
                  Plan <MoneyText cents={dash.safeToSpend?.planOpenCents ?? dash.budget.remainingCents} signed />
                </>
              ) : (
                <Link href="/budget" className="text-link">
                  Set a plan
                </Link>
              )}
              {pending > 0 ? (
                <>
                  . Pending <MoneyText cents={pending} /> is not counted yet.
                </>
              ) : null}
            </>
          }
        />

        {dash.accountCount === 0 && dash.transactions.length === 0 ? (
          <EmptyState
            title="Start with one account"
            action={
              <Link href="/accounts" className="shelf-btn">
                Add an account
              </Link>
            }
          >
            Connect a bank, or add a balance by hand. Sample data is in Settings.
          </EmptyState>
        ) : null}

        {dash.unreviewed.count > 0 ? (
          <Link href={activityHref({ reviewed: "false", focus: "1" })} className="card data-row justify-between gap-3">
            <span className="font-medium">{dash.unreviewed.count} to review</span>
            <span className="text-btn">Review</span>
          </Link>
        ) : null}

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
                  <span className="min-w-0">
                    <span className="block truncate">{tx.name}</span>
                    <span className="block text-[13px] text-[var(--muted)]">{dayLabel(tx.date)}</span>
                  </span>
                  <MoneyText className="shrink-0" cents={-tx.amountCents} signed />
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <SummaryCard
          compact
          label="Net worth"
          cents={dash.netWorth.netWorthCents}
          href="/insights"
          status={worthStatus}
          points={worthPoints}
          chartLabel="Net worth"
        />
      </div>
    </PageShell>
  );
}
