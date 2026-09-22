"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { MerchantMark } from "@/components/MerchantMark";
import { MoneyText } from "@/components/MoneyText";
import { ProgressBar } from "@/components/ProgressBar";
import { Sheet } from "@/components/Sheet";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell, PageSkeleton } from "@/components/ui/PageShell";
import { api } from "@/lib/client";
import { activityHref } from "@/lib/activity";
import { formatMoney } from "@/lib/money";
import { invalidateQueries, useQuery, writeQuery } from "@/lib/use-query";

type Widget = { id: string; hidden: boolean };

type Dash = {
  layout: Widget[];
  netWorth: { assetsCents: number; liabilitiesCents: number; netWorthCents: number };
  snapshots: { date: string; netWorthCents: number }[];
  cashFlow: { incomeCents: number; spendingCents: number; savedCents: number };
  budget: { plannedCents: number; spentCents: number; remainingCents: number; mode: string };
  unreviewed: {
    count: number;
    amountCents: number;
    items: { id: string; name: string; amountCents: number; date: string; categoryName?: string | null }[];
  };
  recurring: { id: string; merchantName: string; amountCents: number; nextDate: string; isIncome: boolean }[];
  goals: {
    id: string;
    name: string;
    targetCents: number;
    targetDate: string | null;
    kind: string;
    progressCents: number;
    remainingCents: number;
    pace: { label: string; tone: "on" | "behind" | "ahead" | "muted" };
  }[];
  accountCount: number;
  transactions: { id: string; name: string; amountCents: number; date: string }[];
  investments: { totalCents: number; count: number };
  plaidConfigured: boolean;
};

const WIDGETS = [
  { id: "netWorth", label: "Net worth" },
  { id: "cashFlow", label: "Cash flow" },
  { id: "budget", label: "Budget" },
  { id: "unreviewed", label: "To review" },
  { id: "recurring", label: "Upcoming" },
  { id: "goals", label: "Goals" },
  { id: "transactions", label: "Recent" },
  { id: "investments", label: "Investments" },
] as const;

const LABELS = Object.fromEntries(WIDGETS.map((widget) => [widget.id, widget.label]));

export default function HomePage() {
  const { data: dash, loading, refreshing, reload, setData } = useQuery<Dash>("dashboard", "/api/dashboard");
  const [error, setError] = useState<string | null>(null);
  const [customizing, setCustomizing] = useState(false);

  useEffect(() => {
    // surface fetch errors without blanking cached data
    if (!dash && !loading) setError(null);
  }, [dash, loading]);

  async function saveLayout(layout: Widget[]) {
    if (!dash) return;
    const next = { ...dash, layout };
    setData(next);
    writeQuery("dashboard", next);
    await api("/api/dashboard", { method: "PUT", body: JSON.stringify({ layout }) });
  }

  function toggle(id: string) {
    if (!dash) return;
    void saveLayout(dash.layout.map((item) => (item.id === id ? { ...item, hidden: !item.hidden } : item)));
  }

  async function markDone(id: string) {
    await api(`/api/transactions/${id}`, { method: "PATCH", body: JSON.stringify({ reviewed: true }) });
    invalidateQueries("dashboard");
    invalidateQueries("tx:");
    reload();
  }

  if (error) return <p className="text-[var(--danger)]">{error}</p>;
  if (!dash && loading) return <PageSkeleton title="Shelf" rows={5} />;
  if (!dash) return <PageSkeleton title="Shelf" rows={5} />;

  const visible = dash.layout.filter((item) => !item.hidden);
  const netWorthWidget = visible.find((item) => item.id === "netWorth");
  const rest = visible.filter((item) => item.id !== "netWorth");

  return (
    <PageShell refreshing={refreshing}>
    <div className="space-y-5">
      <PageHeader
        title="This month"
        subtitle={
          dash.budget.plannedCents > 0
            ? dash.budget.remainingCents >= 0
              ? "You are inside the plan."
              : "Spending is past the plan."
            : "Set a plan for this month."
        }
      >
        <button className="shelf-btn ghost" type="button" onClick={() => setCustomizing(true)}>
          Customize
        </button>
      </PageHeader>

      {netWorthWidget ? (
        <Card className="p-5">
          <p className="mb-2 text-[13px] font-medium text-[var(--muted)]">
            {dash.budget.plannedCents > 0 ? "Left in the plan" : "Net worth"}
          </p>
          <Link href={dash.budget.plannedCents > 0 ? "/budget" : "/insights#worth"} className="block">
            <MoneyText hero cents={dash.budget.plannedCents > 0 ? dash.budget.remainingCents : dash.netWorth.netWorthCents} signed={dash.budget.plannedCents > 0} />
          </Link>
          <p className="mt-2 text-[14px] text-[var(--muted)]">
            Assets <MoneyText cents={dash.netWorth.assetsCents} /> · Debts <MoneyText cents={dash.netWorth.liabilitiesCents} />
          </p>
          {dash.snapshots.length > 1 ? (
            <div className="mt-4 h-20">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dash.snapshots.map((row) => ({ ...row, value: row.netWorthCents / 100 }))}>
                  <YAxis hide domain={["dataMin", "dataMax"]} />
                  <Tooltip formatter={(value) => formatMoney(Math.round(Number(value) * 100))} labelFormatter={(label) => String(label)} />
                  <Area dataKey="value" stroke="#1b7a62" fill="rgba(27,122,98,0.14)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : null}
        </Card>
      ) : null}

      {dash.accountCount === 0 && dash.transactions.length === 0 ? (
        <EmptyState
          title="Start with one account"
          action={
            <Link href="/accounts" className="shelf-btn">
              Add an account
            </Link>
          }
        >
          Connect a bank, or add a manual balance. Sample data is in Settings if you want to look around first.
        </EmptyState>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState title="Home is empty" action={<button className="shelf-btn" type="button" onClick={() => setCustomizing(true)}>Show cards</button>}>
          Every card is hidden. Customize to bring one back.
        </EmptyState>
      ) : null}

      <div className="grid items-start gap-4 md:grid-cols-2">
        {rest.map((item) => (
          <Card key={item.id} className="p-5">
            <h2 className="mb-3 text-[13px] font-medium text-[var(--muted)]">{LABELS[item.id] ?? item.id}</h2>
            {item.id === "cashFlow" && (
              <div className="space-y-2">
                <div className="text-[28px]">
                  <MoneyText figure cents={dash.cashFlow.savedCents} signed />
                </div>
                <p className="text-[14px] text-[var(--muted)]">Saved this month</p>
                <p className="text-[14px]">
                  Income <MoneyText cents={dash.cashFlow.incomeCents} /> · Spending <MoneyText cents={dash.cashFlow.spendingCents} />
                </p>
                <Link href="/insights#flow" className="text-link text-[14px]">
                  Open insights
                </Link>
              </div>
            )}
            {item.id === "budget" && (
              <div className="space-y-3">
                {dash.budget.plannedCents <= 0 ? (
                  <>
                    <p className="text-[15px] text-[var(--muted)]">No plan for this month yet.</p>
                    <p className="text-[14px]">
                      Spent so far <MoneyText cents={dash.budget.spentCents} />
                    </p>
                    <Link href="/budget" className="shelf-btn soft inline-flex">
                      Set up budget
                    </Link>
                  </>
                ) : (
                  <>
                    <div className="text-[28px]">
                      <MoneyText figure cents={dash.budget.remainingCents} signed />
                    </div>
                    <p className="text-[14px] text-[var(--muted)]">Left this month</p>
                    <ProgressBar value={dash.budget.spentCents} max={dash.budget.plannedCents || 1} />
                    <p className="text-[14px]">
                      Spent <MoneyText cents={dash.budget.spentCents} /> of <MoneyText cents={dash.budget.plannedCents} />
                    </p>
                    <Link href="/budget" className="text-link text-[14px]">
                      Open budget
                    </Link>
                  </>
                )}
              </div>
            )}
            {item.id === "unreviewed" && (
              <div className="space-y-3">
                <div className="divide-y divide-[var(--line)] rounded-[12px] border border-[var(--line)]">
                  {dash.unreviewed.items.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between gap-3 px-3 py-3">
                      <Link href={activityHref({ reviewed: "false" })} className="min-w-0 truncate font-medium">
                        {tx.name}
                      </Link>
                      <span className="flex shrink-0 items-center gap-3">
                        <MoneyText cents={-tx.amountCents} signed />
                        <button
                          className="text-[13px] font-semibold text-[var(--positive)]"
                          type="button"
                          onClick={() => markDone(tx.id)}
                          aria-label={`Mark ${tx.name} as reviewed`}
                        >
                          Done
                        </button>
                      </span>
                    </div>
                  ))}
                  {dash.unreviewed.items.length === 0 ? <div className="px-3 py-3 text-[var(--muted)]">Nothing waiting.</div> : null}
                </div>
                <Link href={activityHref({ reviewed: "false" })} className="text-link text-[14px]">
                  Open full inbox
                </Link>
              </div>
            )}
            {item.id === "recurring" && (
              <div className="space-y-2">
                <ul className="space-y-2 text-[14px]">
                  {dash.recurring.map((bill) => (
                    <li key={bill.id} className="flex justify-between gap-3">
                      <span className="truncate">{bill.merchantName}</span>
                      <span className="shrink-0 text-[var(--muted)]">
                        {bill.nextDate} · <MoneyText cents={bill.isIncome ? -bill.amountCents : bill.amountCents} signed />
                      </span>
                    </li>
                  ))}
                  {dash.recurring.length === 0 ? <li className="text-[var(--muted)]">Nothing upcoming.</li> : null}
                </ul>
                <Link href="/recurring" className="text-link text-[14px]">
                  Open recurring
                </Link>
              </div>
            )}
            {item.id === "goals" && (
              <div className="space-y-3">
                {dash.goals.map((goal) => (
                  <Link key={goal.id} href="/goals" className="block">
                    <div className="mb-1 flex items-center justify-between gap-3 text-[14px]">
                      <span className="truncate font-medium">{goal.name}</span>
                      <span className={`pace-${goal.pace.tone === "muted" ? "on" : goal.pace.tone}`}>{goal.pace.label}</span>
                    </div>
                    <ProgressBar value={goal.progressCents} max={Math.max(goal.targetCents, goal.progressCents + goal.remainingCents, 1)} />
                    <p className="mt-1 text-[13px] text-[var(--muted)]">
                      <MoneyText cents={goal.remainingCents} /> left
                    </p>
                  </Link>
                ))}
                {dash.goals.length === 0 ? <p className="text-[var(--muted)]">No goals yet. One target is enough to start.</p> : null}
                <Link href="/goals" className="text-link text-[14px]">
                  Open goals
                </Link>
              </div>
            )}
            {item.id === "transactions" && (
              <div className="space-y-2">
                <ul className="space-y-2 text-[14px]">
                  {dash.transactions.map((tx) => (
                    <li key={tx.id} className="flex justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <MerchantMark name={tx.name} />
                        <span className="truncate">{tx.name}</span>
                      </span>
                      <MoneyText cents={-tx.amountCents} signed />
                    </li>
                  ))}
                  {dash.transactions.length === 0 ? <li className="text-[var(--muted)]">No transactions yet.</li> : null}
                </ul>
                <Link href="/transactions" className="text-link text-[14px]">
                  Open transactions
                </Link>
              </div>
            )}
            {item.id === "investments" && (
              <div>
                <Link href="/insights#holdings" className="text-[28px]">
                  <MoneyText figure cents={dash.investments.totalCents} />
                </Link>
                <p className="text-[14px] text-[var(--muted)]">{dash.investments.count} holdings</p>
              </div>
            )}
          </Card>
        ))}
      </div>

      {customizing ? (
        <Sheet title="Home cards" onClose={() => setCustomizing(false)}>
          <p className="text-[14px] text-[var(--muted)]">Choose what appears on Home.</p>
          <div className="card">
            {dash.layout.map((widget) => (
              <div key={widget.id} className="data-row justify-between gap-3">
                <span>{LABELS[widget.id] ?? widget.id}</span>
                <button type="button" className={`switch ${widget.hidden ? "" : "on"}`} aria-label={`Show ${widget.id}`} onClick={() => toggle(widget.id)} />
              </div>
            ))}
          </div>
        </Sheet>
      ) : null}
    </div>
    </PageShell>
  );
}
