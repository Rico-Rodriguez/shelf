"use client";

import { useEffect, useState } from "react";
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
  account: { name: string } | null;
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

  if (!data) return <p className="pixel-title text-ink-soft">Checking the nest…</p>;

  const pie = Object.entries(data.byType).map(([name, cents]) => ({ name, value: cents / 100 }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="pixel-title text-3xl">Nest</h1>
        <p className="text-sm text-ink-soft">Holdings from Plaid Investments, or the sample cottage brokerage.</p>
      </div>
      <div className="pixel-panel p-4">
        <div className="text-xs text-ink-soft">Total</div>
        <div className="pixel-title text-3xl">
          <MoneyText cents={data.totalCents} />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="pixel-panel h-72 p-4">
          <h2 className="pixel-title mb-2">Allocation</h2>
          {pie.length ? (
            <ResponsiveContainer width="100%" height="85%">
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                  {pie.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="#fff" />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-ink-soft">No holdings yet.</p>
          )}
        </div>
        <div className="pixel-panel overflow-x-auto p-2">
          <table className="w-full text-sm">
            <thead className="text-left">
              <tr>
                <th className="p-2">Holding</th>
                <th className="p-2">Qty</th>
                <th className="p-2">Value</th>
              </tr>
            </thead>
            <tbody>
              {data.holdings.map((h) => (
                <tr key={h.id} className="border-t border-ink/10">
                  <td className="p-2">
                    <div>{h.security?.ticker || h.security?.name}</div>
                    <div className="text-xs text-ink-soft">{h.account?.name}</div>
                  </td>
                  <td className="p-2">{h.quantity}</td>
                  <td className="p-2">
                    <MoneyText cents={h.institutionValueCents} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
