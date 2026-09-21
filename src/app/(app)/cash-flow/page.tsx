"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MoneyText } from "@/components/MoneyText";
import { api } from "@/lib/client";

type Flow = {
  series: { key: string; income: number; spending: number; savings: number }[];
  byCategory: Record<string, number>;
  byMerchant: Record<string, number>;
};

export default function CashFlowPage() {
  const [data, setData] = useState<Flow | null>(null);
  const [grain, setGrain] = useState("month");
  const [merchant, setMerchant] = useState("");

  useEffect(() => {
    const qs = new URLSearchParams({ grain, months: "12" });
    if (merchant) qs.set("merchant", merchant);
    void api<Flow>(`/api/cash-flow?${qs}`).then(setData);
  }, [grain, merchant]);

  if (!data) return <p className="pixel-title text-ink-soft">Watching the current…</p>;

  const chart = data.series.map((s) => ({
    name: s.key,
    Income: s.income / 100,
    Spending: s.spending / 100,
    Saved: s.savings / 100,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="pixel-title text-3xl">Cash flow</h1>
        <p className="text-sm text-ink-soft">What came in, what went out, what stayed in the jar.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <select className="pixel-input max-w-40" value={grain} onChange={(e) => setGrain(e.target.value)}>
          <option value="month">Monthly</option>
          <option value="quarter">Quarterly</option>
        </select>
        <input className="pixel-input max-w-xs" placeholder="Filter merchant" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
      </div>
      <div className="pixel-panel h-80 p-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chart}>
            <CartesianGrid stroke="#e8d4b0" />
            <XAxis dataKey="name" tick={{ fill: "#3d2c29", fontSize: 11 }} />
            <YAxis tick={{ fill: "#3d2c29", fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="Income" fill="#6A9985" />
            <Bar dataKey="Spending" fill="#D97757" />
            <Bar dataKey="Saved" fill="#7A9EAF" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <List title="By shelf" rows={data.byCategory} />
        <List title="By shop" rows={data.byMerchant} />
      </div>
    </div>
  );
}

function List({ title, rows }: { title: string; rows: Record<string, number> }) {
  const sorted = Object.entries(rows).sort((a, b) => b[1] - a[1]).slice(0, 12);
  return (
    <section className="pixel-panel p-4">
      <h2 className="pixel-title mb-2">{title}</h2>
      <ul className="space-y-1 text-sm">
        {sorted.map(([name, cents]) => (
          <li key={name} className="flex justify-between">
            <span>{name}</span>
            <MoneyText cents={cents} />
          </li>
        ))}
      </ul>
    </section>
  );
}
