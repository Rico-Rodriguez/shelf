"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { MoneyText } from "@/components/MoneyText";
import { ProgressBar } from "@/components/ProgressBar";
import { Sheet } from "@/components/Sheet";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/client";
import { activityHref } from "@/lib/activity";
import { formatMoney } from "@/lib/money";

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
    items: { id: string; name: string; amountCents: number; date: string }[];
  };
  recurring: { id: string; merchantName: string; amountCents: number; nextDate: string; isIncome: boolean }[];
  goals: { id: string; name: string; targetCents: number; kind: string }[];
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
  const [dash, setDash] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customizing, setCustomizing] = useState(false);

  const load = useCallback(() => {
    api<Dash>("/api/dashboard")
      .then(setDash)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveLayout(layout: Widget[]) {
    if (!dash) return;
    setDash({ ...dash, layout });
    await api("/api/dashboard", { method: "PUT", body: JSON.stringify({ layout }) });
  }

  function move(id: string, dir: -1 | 1) {
    if (!dash) return;
    const layout = dash.layout.map((item) => ({ ...item }));
    const i = layout.findIndex((item) => item.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= layout.length) return;
    [layout[i], layout[j]] = [layout[j], layout[i]];
    void saveLayout(layout);
  }

  function toggle(id: string) {
    if (!dash) return;
    void saveLayout(dash.layout.map((item) => (item.id === id ? { ...item, hidden: !item.hidden } : item)));
  }

  async function place(id: string) {
    await api(`/api/transactions/${id}`, { method: "PATCH", body: JSON.stringify({ reviewed: true }) });
    load();
  }

  if (error) return <p className="text-[var(--danger)]">{error}</p>;
  if (!dash) return <p className="text-[var(--muted)]">Loading…</p>;

  const visible = dash.layout.filter((item) => !item.hidden);

  return (
    <div className="space-y-5">
      <PageHeader title="Home" subtitle="Where you stand, and what needs a look.">
        <button className="pixel-btn ghost" type="button" onClick={() => setCustomizing(true)}>
          Customize
        </button>
      </PageHeader>

      {visible.length === 0 ? <EmptyState>Every card is hidden. Customize to bring one back.</EmptyState> : null}

      <div className="grid gap-4 md:grid-cols-2">
        {visible.map((item) => (
          <Card key={item.id} className="p-4">
            <h2 className="mb-3 text-[13px] font-medium uppercase tracking-[0.06em] text-[var(--muted)]">{LABELS[item.id] ?? item.id}</h2>
            {item.id === "netWorth" && (
              <div>
                <Link href="/reports" className="text-[32px] font-semibold tracking-[-0.03em]">
                  <MoneyText cents={dash.netWorth.netWorthCents} />
                </Link>
                <p className="mt-1 text-[14px] text-[var(--muted)]">
                  Assets <MoneyText cents={dash.netWorth.assetsCents} /> · Debts <MoneyText cents={dash.netWorth.liabilitiesCents} />
                </p>
                {dash.snapshots.length > 1 ? (
                  <div className="mt-3 h-16">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={dash.snapshots.map((row) => ({ ...row, value: row.netWorthCents / 100 }))}>
                        <YAxis hide domain={["dataMin", "dataMax"]} />
                        <Tooltip formatter={(value) => formatMoney(Math.round(Number(value) * 100))} labelFormatter={(label) => String(label)} />
                        <Area dataKey="value" stroke="#1f4d45" fill="rgba(31,77,69,0.15)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : null}
              </div>
            )}
            {item.id === "cashFlow" && (
              <div className="space-y-2">
                <div className="text-[28px] font-semibold tracking-[-0.03em]">
                  <MoneyText cents={dash.cashFlow.savedCents} signed />
                </div>
                <p className="text-[14px] text-[var(--muted)]">Saved this month</p>
                <p className="text-[14px]">
                  Income <MoneyText cents={dash.cashFlow.incomeCents} /> · Spending <MoneyText cents={dash.cashFlow.spendingCents} />
                </p>
                <Link href="/cash-flow" className="text-[14px] font-medium text-[var(--terracotta)]">
                  Open cash flow
                </Link>
              </div>
            )}
            {item.id === "budget" && (
              <div className="space-y-3">
                <div className="text-[28px] font-semibold tracking-[-0.03em]">
                  <MoneyText cents={dash.budget.remainingCents} signed />
                </div>
                <p className="text-[14px] text-[var(--muted)]">Left this month</p>
                <ProgressBar value={dash.budget.spentCents} max={dash.budget.plannedCents || 1} />
                <p className="text-[14px]">
                  Spent <MoneyText cents={dash.budget.spentCents} /> of <MoneyText cents={dash.budget.plannedCents} />
                </p>
                <Link href="/budget" className="text-[14px] font-medium text-[var(--terracotta)]">
                  Open budget
                </Link>
              </div>
            )}
            {item.id === "unreviewed" && (
              <div className="space-y-2">
                <p className="text-[14px] text-[var(--muted)]">
                  {dash.unreviewed.count} to review · <MoneyText cents={dash.unreviewed.amountCents} />
                </p>
                <div className="card">
                  {dash.unreviewed.items.map((tx) => (
                    <div key={tx.id} className="data-row justify-between gap-3">
                      <span className="min-w-0 truncate">{tx.name}</span>
                      <span className="flex shrink-0 items-center gap-3">
                        <MoneyText cents={-tx.amountCents} signed />
                        <button className="text-[13px] font-semibold text-[var(--terracotta)]" type="button" onClick={() => place(tx.id)}>
                          Review
                        </button>
                      </span>
                    </div>
                  ))}
                  {dash.unreviewed.items.length === 0 ? <div className="data-row text-[var(--muted)]">Nothing waiting.</div> : null}
                </div>
                <Link href={activityHref({ reviewed: "false" })} className="text-[14px] font-medium text-[var(--terracotta)]">
                  Review all
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
                <Link href="/recurring" className="text-[14px] font-medium text-[var(--terracotta)]">
                  Open recurring
                </Link>
              </div>
            )}
            {item.id === "goals" && (
              <div className="space-y-2">
                <ul className="space-y-2 text-[14px]">
                  {dash.goals.map((goal) => (
                    <li key={goal.id} className="flex justify-between gap-3">
                      <span className="truncate">{goal.name}</span>
                      <span className="text-[var(--muted)]">{goal.kind === "pay_down" ? "Pay down" : "Save"}</span>
                    </li>
                  ))}
                  {dash.goals.length === 0 ? <li className="text-[var(--muted)]">No goals yet.</li> : null}
                </ul>
                <Link href="/goals" className="text-[14px] font-medium text-[var(--terracotta)]">
                  Open goals
                </Link>
              </div>
            )}
            {item.id === "transactions" && (
              <div className="space-y-2">
                <ul className="space-y-2 text-[14px]">
                  {dash.transactions.map((tx) => (
                    <li key={tx.id} className="flex justify-between gap-3">
                      <span className="truncate">{tx.name}</span>
                      <MoneyText cents={-tx.amountCents} signed />
                    </li>
                  ))}
                  {dash.transactions.length === 0 ? <li className="text-[var(--muted)]">No transactions yet.</li> : null}
                </ul>
                <Link href="/transactions" className="text-[14px] font-medium text-[var(--terracotta)]">
                  Open transactions
                </Link>
              </div>
            )}
            {item.id === "investments" && (
              <div>
                <Link href="/investments" className="text-[28px] font-semibold tracking-[-0.03em]">
                  <MoneyText cents={dash.investments.totalCents} />
                </Link>
                <p className="text-[14px] text-[var(--muted)]">{dash.investments.count} holdings</p>
              </div>
            )}
          </Card>
        ))}
      </div>

      {customizing ? (
        <Sheet title="Home cards" onClose={() => setCustomizing(false)}>
          <div className="card">
            {dash.layout.map((widget, index) => (
              <div key={widget.id} className="data-row justify-between gap-3">
                <span>{LABELS[widget.id] ?? widget.id}</span>
                <span className="flex items-center gap-1">
                  <button className="ios-icon-btn" type="button" aria-label={`Move ${widget.id} up`} onClick={() => move(widget.id, -1)} disabled={index === 0}>
                    ↑
                  </button>
                  <button className="ios-icon-btn" type="button" aria-label={`Move ${widget.id} down`} onClick={() => move(widget.id, 1)} disabled={index === dash.layout.length - 1}>
                    ↓
                  </button>
                  <button type="button" className={`switch ${widget.hidden ? "" : "on"}`} aria-label={`Show ${widget.id}`} onClick={() => toggle(widget.id)} />
                </span>
              </div>
            ))}
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}
