"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MoneyText } from "@/components/MoneyText";
import { ProgressBar } from "@/components/ProgressBar";
import { Sheet } from "@/components/Sheet";
import { api } from "@/lib/client";
import { activityHref } from "@/lib/activity";

type Dash = {
  layout: string[];
  netWorth: { assetsCents: number; liabilitiesCents: number; netWorthCents: number };
  budget: { plannedCents: number; spentCents: number; remainingCents: number; mode: string };
  unreviewed: {
    count: number;
    amountCents: number;
    items: { id: string; name: string; amountCents: number; date: string }[];
  };
  recurring: { id: string; merchantName: string; amountCents: number; nextDate: string; isIncome: boolean }[];
  transactions: { id: string; name: string; amountCents: number; date: string }[];
  investments: { totalCents: number; count: number };
  plaidConfigured: boolean;
  itemCount: number;
  trialLimit: number;
};

const WIDGETS = [
  { id: "netWorth", label: "Net worth" },
  { id: "budget", label: "This month" },
  { id: "unreviewed", label: "To review" },
  { id: "recurring", label: "Coming up" },
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

  async function saveLayout(layout: string[]) {
    if (!dash) return;
    setDash({ ...dash, layout });
    await api("/api/dashboard", { method: "PUT", body: JSON.stringify({ layout }) });
  }

  function move(id: string, dir: -1 | 1) {
    if (!dash) return;
    const layout = [...dash.layout];
    const i = layout.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= layout.length) return;
    [layout[i], layout[j]] = [layout[j], layout[i]];
    void saveLayout(layout);
  }

  function toggle(id: string) {
    if (!dash) return;
    const layout = dash.layout.includes(id) ? dash.layout.filter((item) => item !== id) : [...dash.layout, id];
    void saveLayout(layout);
  }

  async function place(id: string) {
    await api(`/api/transactions/${id}`, { method: "PATCH", body: JSON.stringify({ reviewed: true }) });
    load();
  }

  if (error) return <p className="text-[var(--terracotta)]">{error}</p>;
  if (!dash) return <p className="text-[var(--muted)]">Loading…</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1>Home</h1>
          <p>{dash.plaidConfigured ? `${dash.itemCount}/${dash.trialLimit} bank logins` : "Sample data"}</p>
        </div>
        <button className="pixel-btn ghost" type="button" onClick={() => setCustomizing(true)}>
          Customize
        </button>
      </div>

      {dash.layout.length === 0 ? <p className="text-[15px] text-[var(--muted)]">Every card is hidden. Customize to bring one back.</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        {dash.layout.map((id) => (
          <section key={id} className="pixel-panel p-4">
            <h2 className="mb-2 text-[17px] font-semibold tracking-[-0.41px]">{LABELS[id] ?? id}</h2>
            {id === "netWorth" && (
              <div>
                <Link href="/reports" className="text-[34px] font-bold leading-[41px] tracking-[-0.4px]">
                  <MoneyText cents={dash.netWorth.netWorthCents} />
                </Link>
                <p className="mt-1 text-[15px] text-[var(--muted)]">
                  Assets <MoneyText cents={dash.netWorth.assetsCents} /> · Debts <MoneyText cents={dash.netWorth.liabilitiesCents} />
                </p>
              </div>
            )}
            {id === "budget" && (
              <div className="space-y-3">
                <div className="text-[28px] font-bold leading-8 tracking-[-0.36px]">
                  <MoneyText cents={dash.budget.remainingCents} signed />
                </div>
                <p className="text-[15px] text-[var(--muted)]">Left this month</p>
                <ProgressBar value={dash.budget.spentCents} max={dash.budget.plannedCents || 1} />
                <p className="text-[15px]">
                  Spent <MoneyText cents={dash.budget.spentCents} /> of <MoneyText cents={dash.budget.plannedCents} />
                </p>
                <Link href="/budget" className="text-[17px] text-[var(--terracotta)]">
                  Open budget
                </Link>
              </div>
            )}
            {id === "unreviewed" && (
              <div className="space-y-2">
                <p className="text-[15px] text-[var(--muted)]">
                  {dash.unreviewed.count} to review · <MoneyText cents={dash.unreviewed.amountCents} />
                </p>
                <div className="ios-group">
                  {dash.unreviewed.items.map((tx) => (
                    <div key={tx.id} className="ios-row justify-between gap-3">
                      <span className="min-w-0 truncate text-[16px]">{tx.name}</span>
                      <span className="flex shrink-0 items-center gap-3">
                        <MoneyText cents={-tx.amountCents} signed />
                        <button className="text-[15px] font-semibold text-[var(--terracotta)]" type="button" onClick={() => place(tx.id)}>
                          Review
                        </button>
                      </span>
                    </div>
                  ))}
                  {dash.unreviewed.items.length === 0 ? <div className="ios-row text-[var(--muted)]">Nothing waiting.</div> : null}
                </div>
                <Link href={activityHref({ reviewed: "false" })} className="text-[17px] text-[var(--terracotta)]">
                  Review all
                </Link>
              </div>
            )}
            {id === "recurring" && (
              <div className="space-y-2">
                <ul className="space-y-2 text-[15px]">
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
                <Link href="/recurring" className="text-[17px] text-[var(--terracotta)]">
                  Open bills
                </Link>
              </div>
            )}
            {id === "transactions" && (
              <div className="space-y-2">
                <ul className="space-y-2 text-[15px]">
                  {dash.transactions.map((tx) => (
                    <li key={tx.id} className="flex justify-between gap-3">
                      <span className="truncate">{tx.name}</span>
                      <MoneyText cents={-tx.amountCents} signed />
                    </li>
                  ))}
                  {dash.transactions.length === 0 ? <li className="text-[var(--muted)]">No transactions yet.</li> : null}
                </ul>
                <Link href="/transactions" className="text-[17px] text-[var(--terracotta)]">
                  Open activity
                </Link>
              </div>
            )}
            {id === "investments" && (
              <div>
                <Link href="/investments" className="text-[28px] font-bold leading-8 tracking-[-0.36px]">
                  <MoneyText cents={dash.investments.totalCents} />
                </Link>
                <p className="text-[15px] text-[var(--muted)]">{dash.investments.count} holdings</p>
              </div>
            )}
          </section>
        ))}
      </div>

      {customizing ? (
        <Sheet title="Home cards" onClose={() => setCustomizing(false)}>
          <div className="ios-group">
            {WIDGETS.map((widget) => {
              const on = dash.layout.includes(widget.id);
              const index = dash.layout.indexOf(widget.id);
              return (
                <div key={widget.id} className="ios-row justify-between gap-3">
                  <span>{widget.label}</span>
                  <span className="flex items-center gap-1">
                    {on ? (
                      <>
                        <button className="ios-icon-btn" type="button" aria-label={`Move ${widget.label} up`} onClick={() => move(widget.id, -1)} disabled={index === 0}>
                          ↑
                        </button>
                        <button
                          className="ios-icon-btn"
                          type="button"
                          aria-label={`Move ${widget.label} down`}
                          onClick={() => move(widget.id, 1)}
                          disabled={index === dash.layout.length - 1}
                        >
                          ↓
                        </button>
                      </>
                    ) : null}
                    <button type="button" className={`switch ${on ? "on" : ""}`} aria-label={`Show ${widget.label}`} onClick={() => toggle(widget.id)} />
                  </span>
                </div>
              );
            })}
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}
