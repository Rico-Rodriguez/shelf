"use client";

import Link from "next/link";
import { MoneyText } from "@/components/MoneyText";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell, PageSkeleton } from "@/components/ui/PageShell";
import { activityHref } from "@/lib/activity";
import { versusPhrase } from "@/lib/voice";
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
  const phrase = versusPhrase(dash.usual?.deltaCents ?? null);
  const pending = dash.safeToSpend?.pendingCents ?? 0;

  return (
    <PageShell refreshing={refreshing}>
      <div className="space-y-6">
        <PageHeader title="This month" subtitle={phrase ?? undefined} />

        <section>
          <p className="text-[13px] text-[var(--muted)]">Safe to spend</p>
          <Link href="/budget" className="mt-1 block">
            <MoneyText hero cents={hero} />
          </Link>
          <p className="mt-3 text-[15px] text-[var(--muted)]">
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
          </p>
          {pending > 0 ? (
            <p className="mt-1 text-[13px] text-[var(--tertiary)]">
              Pending <MoneyText cents={pending} /> is not included.
            </p>
          ) : null}
          {forecast ? (
            <p className="mt-1 text-[13px] text-[var(--tertiary)]">
              About <MoneyText cents={forecast.balanceCents} /> in 30 days if bills post.
            </p>
          ) : null}
        </section>

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
              <h2 className="text-[13px] font-medium text-[var(--muted)]">To review</h2>
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

        <Link href="/insights" className="card data-row justify-between">
          <span>Net worth</span>
          <MoneyText cents={dash.netWorth.netWorthCents} />
        </Link>
      </div>
    </PageShell>
  );
}
