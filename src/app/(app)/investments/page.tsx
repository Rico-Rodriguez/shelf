"use client";

import { useEffect, useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { MoneyText } from "@/components/MoneyText";
import { api } from "@/lib/client";

const COLORS = ["#34C759", "#007AFF", "#FF9F0A", "#AF52DE", "#FF375F", "#64D2FF"];

type Hold = {
  id: string;
  quantity: string;
  institutionValueCents: number;
  costBasisCents: number | null;
  security: { name: string; ticker: string | null; type: string | null } | null;
  account: { id: string; name: string } | null;
};

type Payload = {
  holdings: Hold[];
  totalCents: number;
  byType: Record<string, number>;
};

export default function InvestmentsPage() {
  const [data, setData] = useState<Payload | null>(null);

  useEffect(() => {
    void api<Payload>("/api/investments").then(setData);
  }, []);

  const groups = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { name: string; rows: Hold[] }>();
    for (const holding of data.holdings) {
      const key = holding.account?.id ?? "none";
      const bucket = map.get(key) ?? { name: holding.account?.name ?? "Account", rows: [] };
      bucket.rows.push(holding);
      map.set(key, bucket);
    }
    return [...map.values()];
  }, [data]);

  if (!data) return <p className="text-[var(--muted)]">Loading…</p>;

  const pie = Object.entries(data.byType).map(([name, cents]) => ({ name: labelType(name), value: cents / 100, cents }));
  const total = pie.reduce((sum, slice) => sum + slice.cents, 0) || 1;
  const gainRows = data.holdings.filter((holding) => holding.costBasisCents != null);
  const gain = gainRows.reduce((sum, holding) => sum + holding.institutionValueCents - (holding.costBasisCents ?? 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1>Investments</h1>
        <p>Holdings from connected accounts, grouped by account.</p>
      </div>
      <div className="pixel-panel grid grid-cols-2 divide-x divide-[var(--line)] p-0">
        <div className="px-4 py-3">
          <div className="text-[13px] text-[var(--muted)]">Total</div>
          <div className="text-[28px] font-bold tracking-tight">
            <MoneyText cents={data.totalCents} />
          </div>
        </div>
        <div className="px-4 py-3">
          <div className="text-[13px] text-[var(--muted)]">Gain</div>
          <div className="text-[28px] font-bold tracking-tight">
            {gainRows.length ? <MoneyText cents={gain} signed /> : <span className="text-[17px] font-normal text-[var(--muted)]">No cost basis</span>}
          </div>
        </div>
      </div>

      {data.holdings.length === 0 ? <p className="text-[15px] text-[var(--muted)]">No holdings yet.</p> : null}

      {pie.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="pixel-panel h-64 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={80}>
                  {pie.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} stroke="#fff" />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => usd(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="ios-group self-start">
            {pie.map((slice, index) => (
              <li key={slice.name} className="ios-row justify-between gap-3">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: COLORS[index % COLORS.length] }} />
                  <span className="truncate">{slice.name}</span>
                </span>
                <span className="shrink-0 text-[var(--muted)]">
                  {Math.round((slice.cents / total) * 100)}% · <MoneyText cents={slice.cents} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {groups.map((group) => (
        <section key={group.name}>
          <h2 className="ios-section">{group.name}</h2>
          <ul className="ios-group">
            {group.rows.map((holding) => {
              const gainCents = holding.costBasisCents == null ? null : holding.institutionValueCents - holding.costBasisCents;
              return (
                <li key={holding.id} className="ios-row justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{holding.security?.ticker || holding.security?.name || "Holding"}</div>
                    <div className="truncate text-[13px] text-[var(--muted)]">
                      {holding.quantity} shares
                      {holding.security?.name && holding.security.ticker ? ` · ${holding.security.name}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <MoneyText cents={holding.institutionValueCents} />
                    {gainCents != null ? (
                      <div className="text-[13px]">
                        <MoneyText cents={gainCents} signed />
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function labelType(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function usd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
