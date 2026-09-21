"use client";

import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MoneyText } from "@/components/MoneyText";
import { SankeyChart } from "@/components/SankeyChart";
import { api } from "@/lib/client";
import { addMonths, monthName, yearMonth } from "@/lib/dates";
import { shelfColor } from "@/lib/palette";

type Report = {
  year: number;
  month: number;
  incomeCents: number;
  spendingCents: number;
  byCategory: { name: string; group: string; cents: number; color: string }[];
  sankey: { nodes: { id: string; color: string }[]; links: { source: string; target: string; value: number }[] };
  netWorth: { netWorthCents: number; assetsCents: number; liabilitiesCents: number };
  snapshots: { date: string; netWorthCents: number; assetsCents: number; liabilitiesCents: number }[];
};

export default function ReportsPage() {
  const now = yearMonth();
  const [cursor, setCursor] = useState(now);
  const [data, setData] = useState<Report | null>(null);

  useEffect(() => {
    void api<Report>(`/api/reports?year=${cursor.year}&month=${cursor.month}`).then(setData);
  }, [cursor]);

  if (!data) return <p className="pixel-title text-ink-soft">Laying out the maps…</p>;
  const prev = addMonths(cursor.year, cursor.month, -1);
  const next = addMonths(cursor.year, cursor.month, 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="pixel-title">Reports</h1>
          <p>Income, spending, and net worth.</p>
        </div>
        <div className="flex gap-2">
          <button className="ios-icon-btn size-11 text-[22px] text-[var(--terracotta)]" type="button" onClick={() => setCursor(prev)} aria-label="Previous month">‹</button>
          <span className="min-w-36 text-center text-[17px] font-semibold tracking-[-0.41px]">{monthName(cursor.year, cursor.month)}</span>
          <button className="ios-icon-btn size-11 text-[22px] text-[var(--terracotta)]" type="button" onClick={() => setCursor(next)} aria-label="Next month">›</button>
        </div>
      </div>

      <div className="pixel-panel grid grid-cols-3 divide-x divide-[var(--line)]">
        <Stat label="Income" cents={data.incomeCents} />
        <Stat label="Spending" cents={data.spendingCents} />
        <Stat label="Net worth" cents={data.netWorth.netWorthCents} />
      </div>

      <section>
        <h2 className="ios-section">Flow</h2>
        <div className="pixel-panel px-2 py-3">
          <SankeyChart
            nodes={data.sankey.nodes.map((n) => ({ ...n, color: shelfColor(n.color) }))}
            links={data.sankey.links}
          />
        </div>
      </section>

      <section>
        <h2 className="ios-section">Spending</h2>
        <ul className="ios-group">
          {data.byCategory.map((c) => (
            <li key={c.name} className="ios-row justify-between gap-3">
              <span className="flex min-w-0 items-center gap-3">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: shelfColor(c.color) }} />
                <span className="truncate">{c.name}</span>
              </span>
              <MoneyText className="shrink-0 text-[var(--muted)]" cents={c.cents} />
            </li>
          ))}
          {data.byCategory.length === 0 ? <li className="ios-row text-[var(--muted)]">Nothing this month.</li> : null}
        </ul>
      </section>

      <section>
        <h2 className="ios-section">Net worth</h2>
        <div className="pixel-panel h-64 px-1 py-3">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.snapshots.map((s) => ({ date: s.date, Worth: s.netWorthCents / 100 }))} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="rgba(60,60,67,0.1)" />
              <XAxis dataKey="date" tick={{ fill: "rgba(60,60,67,0.6)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={shortDate} minTickGap={28} />
              <YAxis tick={{ fill: "rgba(60,60,67,0.6)", fontSize: 11 }} axisLine={false} tickLine={false} width={52} tickFormatter={axisMoney} />
              <Tooltip
                formatter={(value) => [usd(Number(value)), "Net worth"]}
                labelFormatter={(label) => shortDate(String(label))}
                contentStyle={{
                  border: "none",
                  borderRadius: 12,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  fontSize: 13,
                }}
              />
              <Area type="monotone" dataKey="Worth" stroke="#0A84FF" fill="rgba(10,132,255,0.16)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="px-4 py-3">
      <div className="text-[13px] leading-[18px] text-[var(--muted)]">{label}</div>
      <div className="mt-0.5 text-[22px] font-bold leading-7 tracking-[-0.26px]">
        <MoneyText cents={cents} />
      </div>
    </div>
  );
}

function shortDate(value: string) {
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!parsed) return value;
  return new Date(Number(parsed[1]), Number(parsed[2]) - 1, Number(parsed[3])).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function axisMoney(value: number) {
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  if (abs >= 1000) {
    const n = abs / 1000;
    return `${sign}$${n.toFixed(n >= 10 ? 0 : 1)}k`;
  }
  return `${sign}$${Math.round(abs)}`;
}

function usd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
