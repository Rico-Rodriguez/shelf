"use client";

import Link from "next/link";
import { MoneyText } from "@/components/MoneyText";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell, PageSkeleton } from "@/components/ui/PageShell";
import { SummaryCard } from "@/components/ui/SummaryCard";
import { activityHref } from "@/lib/activity";
import { inDaysPhrase, todayISO } from "@/lib/dates";
import { versusStatus } from "@/lib/voice";
import { useQuery } from "@/lib/use-query";

type Dash = {
  netWorth: { assetsCents: number; liabilitiesCents: number; netWorthCents: number };
  cashFlow: { incomeCents: number; spendingCents: number; savedCents: number };
  budget: { plannedCents: number; spentCents: number; remainingCents: number; mode: string };
  unreviewed: {
    count: number;
    amountCents: number;
    items: { id: string; name: string; amountCents: number; date: string }[];
  };
  recurring: { id: string; merchantName: string; amountCents: number; nextDate: string; isIncome: boolean }[];
  accountCount: number;
  transactions: { id: string; name: string }[];
  safeToSpend?: {
    cents: number;
    cashCents?: number;
    billsDueCents?: number;
    planOpenCents?: number;
    pendingCents?: number;
  };
  usual?: { deltaCents: number | null };
  forecast?: { date: string; balanceCents: number }[];
  suggestedSubscriptions?: { merchantName: string }[];
};

export default function HomePage() {
  const { data: dash, loading, refreshing } = useQuery<Dash>("dashboard", "/api/dashboard");

  if (!dash && loading) return <PageSkeleton title="Shelf" rows={4} />;
  if (!dash) return <PageSkeleton title="Shelf" rows={4} />;

  const hero = dash.safeToSpend?.cents ?? dash.budget.remainingCents;
  const bills = dash.recurring.filter((row) => !row.isIncome).slice(0, 3);
  const review = dash.unreviewed.items.slice(0, 3);
  const forecast = dash.forecast?.length ? dash.forecast[dash.forecast.length - 1] : null;
  const pending = dash.safeToSpend?.pendingCents ?? 0;
  const today = todayISO();
  const next = dash.recurring.find((row) => row.nextDate >= today);
  const cashPoints = (dash.forecast ?? []).map((point) => ({ date: point.date, cents: point.balanceCents }));

  return (
    <PageShell refreshing={refreshing}>
      <div className="space-y-6">
        <PageHeader title="This month" />

        <SummaryCard
          label="Safe to spend"
          cents={hero}
          href="/budget"
          status={versusStatus(dash.usual?.deltaCents ?? null, "usual spend")}
          points={cashPoints}
          caption={cashPoints.length > 1 ? "30 days" : undefined}
          chartLabel="Cash over the next 30 days"
          footer={
            next ? (
              `${next.isIncome ? "Payday" : next.merchantName} ${inDaysPhrase(next.nextDate)}`
            ) : forecast ? (
              <>
                About <MoneyText cents={forecast.balanceCents} /> in 30 days
              </>
            ) : null
          }
          footerIcon={next ? "calendar" : undefined}
          detail={
            <>
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
              {" · "}
              Cash <MoneyText cents={dash.safeToSpend?.cashCents ?? 0} />
              {pending > 0 ? (
                <>
                  . Pending <MoneyText cents={pending} /> is not included.
                </>
              ) : null}
              {forecast && next ? (
                <>
                  . About <MoneyText cents={forecast.balanceCents} /> in 30 days if bills post.
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
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-[13px] font-medium text-[var(--muted)]">{dash.unreviewed.count} to review</h2>
              <Link href={activityHref({ reviewed: "false", focus: "1" })} className="text-btn">
                Review
              </Link>
            </div>
            <div className="card">
              {review.map((tx) => (
                <Link key={tx.id} href={activityHref({ reviewed: "false", focus: "1" })} className="data-row justify-between gap-3">
                  <span className="truncate">{tx.name}</span>
                  <MoneyText cents={-tx.amountCents} signed />
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {bills.length > 0 ? (
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-[13px] font-medium text-[var(--muted)]">Upcoming</h2>
              <Link href="/recurring" className="text-btn">
                Bills
              </Link>
            </div>
            <div className="card">
              {bills.map((bill) => (
                <Link key={bill.id} href="/recurring" className="data-row justify-between gap-3">
                  <span className="truncate">{bill.merchantName}</span>
                  <span className="shrink-0 text-[var(--muted)]">
                    {bill.nextDate.slice(5)} · <MoneyText cents={bill.amountCents} />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {dash.suggestedSubscriptions?.length ? (
          <p className="text-[15px]">
            <Link href="/recurring" className="text-link">
              {dash.suggestedSubscriptions.length} possible subscription{dash.suggestedSubscriptions.length === 1 ? "" : "s"}
            </Link>
          </p>
        ) : null}

        <div className="card">
          <Link href="/insights" className="data-row justify-between gap-3">
            <span className="truncate">Net worth</span>
            <MoneyText className="shrink-0" cents={dash.netWorth.netWorthCents} />
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
