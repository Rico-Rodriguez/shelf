"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MoneyText } from "@/components/MoneyText";
import { ProgressBar } from "@/components/ProgressBar";
import { api } from "@/lib/client";

type Dash = {
  layout: string[];
  netWorth: { assetsCents: number; liabilitiesCents: number; netWorthCents: number };
  budget: { plannedCents: number; spentCents: number; remainingCents: number; mode: string };
  unreviewed: { count: number; items: { id: string; name: string; amountCents: number; date: string }[] };
  recurring: { id: string; merchantName: string; amountCents: number; nextDate: string; isIncome: boolean }[];
  transactions: { id: string; name: string; amountCents: number; date: string }[];
  investments: { totalCents: number; count: number };
  plaidConfigured: boolean;
  itemCount: number;
  trialLimit: number;
};

const LABELS: Record<string, string> = {
  netWorth: "Net worth",
  budget: "This month",
  unreviewed: "To review",
  recurring: "Coming up",
  transactions: "Recent",
  investments: "Investments",
};

export default function HomePage() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Dash>("/api/dashboard")
      .then(setDash)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function move(id: string, dir: -1 | 1) {
    if (!dash) return;
    const layout = [...dash.layout];
    const i = layout.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= layout.length) return;
    [layout[i], layout[j]] = [layout[j], layout[i]];
    setDash({ ...dash, layout });
    await api("/api/dashboard", { method: "PUT", body: JSON.stringify({ layout }) });
  }

  async function place(id: string) {
    await api(`/api/transactions/${id}`, { method: "PATCH", body: JSON.stringify({ reviewed: true }) });
    load();
  }

  if (error) return <p className="text-[var(--terracotta)]">{error}</p>;
  if (!dash) return <p className="text-[var(--muted)]">Loading…</p>;

  return (
    <div className="space-y-5">
      <div>
        <h1>Home</h1>
        <p>{dash.plaidConfigured ? `${dash.itemCount}/${dash.trialLimit} bank logins` : "Sample house"}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {dash.layout.map((id) => (
          <section key={id} className="pixel-panel p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[17px] font-semibold tracking-[-0.41px]">{LABELS[id] ?? id}</h2>
              <div className="flex">
                <button className="ios-icon-btn" onClick={() => move(id, -1)} type="button" aria-label="Move up">
                  ↑
                </button>
                <button className="ios-icon-btn" onClick={() => move(id, 1)} type="button" aria-label="Move down">
                  ↓
                </button>
              </div>
            </div>
            {id === "netWorth" && (
              <div>
                <div className="text-[34px] font-bold leading-[41px] tracking-[-0.4px]">
                  <MoneyText cents={dash.netWorth.netWorthCents} />
                </div>
                <p className="mt-1 text-[15px] text-[var(--muted)]">
                  Assets <MoneyText cents={dash.netWorth.assetsCents} /> · Owed{" "}
                  <MoneyText cents={dash.netWorth.liabilitiesCents} />
                </p>
              </div>
            )}
            {id === "budget" && (
              <div className="space-y-3">
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
                <p className="text-[15px] text-[var(--muted)]">{dash.unreviewed.count} left to review</p>
                <div className="ios-group">
                  {dash.unreviewed.items.map((tx) => (
                    <div key={tx.id} className="ios-row justify-between">
                      <span className="truncate text-[16px]">{tx.name}</span>
                      <button className="pixel-btn min-h-9 px-3 text-sm" type="button" onClick={() => place(tx.id)}>
                        Done
                      </button>
                    </div>
                  ))}
                </div>
                <Link href="/transactions" className="text-[17px] text-[var(--terracotta)]">
                  Review all
                </Link>
              </div>
            )}
            {id === "recurring" && (
              <ul className="space-y-2 text-[15px]">
                {dash.recurring.map((r) => (
                  <li key={r.id} className="flex justify-between gap-3">
                    <span>{r.merchantName}</span>
                    <span className="text-[var(--muted)]">
                      {r.nextDate} · <MoneyText cents={r.isIncome ? -r.amountCents : r.amountCents} signed />
                    </span>
                  </li>
                ))}
                {dash.recurring.length === 0 ? <li className="text-[var(--muted)]">Nothing upcoming.</li> : null}
              </ul>
            )}
            {id === "transactions" && (
              <ul className="space-y-2 text-[15px]">
                {dash.transactions.map((tx) => (
                  <li key={tx.id} className="flex justify-between gap-3">
                    <span className="truncate">{tx.name}</span>
                    <MoneyText cents={-tx.amountCents} signed />
                  </li>
                ))}
              </ul>
            )}
            {id === "investments" && (
              <div>
                <div className="text-[28px] font-bold leading-8 tracking-[-0.36px]">
                  <MoneyText cents={dash.investments.totalCents} />
                </div>
                <p className="text-[15px] text-[var(--muted)]">{dash.investments.count} holdings</p>
                <Link href="/investments" className="text-[17px] text-[var(--terracotta)]">
                  Open investments
                </Link>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
