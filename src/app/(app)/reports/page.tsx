"use client";

import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MoneyText } from "@/components/MoneyText";
import { SankeyChart } from "@/components/SankeyChart";
import { api } from "@/lib/client";
import { addMonths, monthName, yearMonth } from "@/lib/dates";

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
          <h1 className="pixel-title text-3xl">Reports</h1>
          <p className="text-sm text-ink-soft">Spending shelves, net worth over time, and a cozy Sankey.</p>
        </div>
        <div className="flex gap-2">
          <button className="pixel-btn ghost" type="button" onClick={() => setCursor(prev)}>←</button>
          <span className="pixel-title px-2 py-1">{monthName(cursor.year, cursor.month)}</span>
          <button className="pixel-btn ghost" type="button" onClick={() => setCursor(next)}>→</button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Stat label="In" cents={data.incomeCents} />
        <Stat label="Out" cents={data.spendingCents} />
        <Stat label="Net worth" cents={data.netWorth.netWorthCents} />
      </div>

      <section className="pixel-panel p-4">
        <h2 className="pixel-title mb-2">Sankey</h2>
        <SankeyChart nodes={data.sankey.nodes} links={data.sankey.links} />
      </section>

      <section className="pixel-panel p-4">
        <h2 className="pixel-title mb-2">Spending by shelf</h2>
        <ul className="space-y-2">
          {data.byCategory.map((c) => (
            <li key={c.name} className="flex items-center justify-between gap-3 text-sm">
              <span className="chip" style={{ background: c.color }}>{c.name}</span>
              <MoneyText cents={c.cents} />
            </li>
          ))}
        </ul>
      </section>

      <section className="pixel-panel h-72 p-4">
        <h2 className="pixel-title mb-2">Net worth over time</h2>
        <ResponsiveContainer width="100%" height="85%">
          <AreaChart data={data.snapshots.map((s) => ({ date: s.date, Worth: s.netWorthCents / 100 }))}>
            <CartesianGrid stroke="#e8d4b0" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Area type="monotone" dataKey="Worth" stroke="#7A9EAF" fill="#E4EEF2" />
          </AreaChart>
        </ResponsiveContainer>
      </section>
    </div>
  );
}

function Stat({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="pixel-panel p-4">
      <div className="text-xs text-ink-soft">{label}</div>
      <div className="pixel-title text-2xl">
        <MoneyText cents={cents} />
      </div>
    </div>
  );
}
