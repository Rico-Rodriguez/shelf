"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MoneyText } from "@/components/MoneyText";
import { MonthNav } from "@/components/MonthNav";
import { SankeyChart } from "@/components/SankeyChart";
import { Stat } from "@/components/Stat";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/PageShell";
import { api } from "@/lib/client";
import { activityHref } from "@/lib/activity";
import { monthRange, yearMonth } from "@/lib/dates";
import { shelfColor } from "@/lib/palette";

type Report = {
  year: number;
  month: number;
  incomeCents: number;
  spendingCents: number;
  byCategory: { id: string; name: string; group: string; cents: number; color: string }[];
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

  if (!data) return <PageSkeleton title="Reports" rows={5} />;
  const range = monthRange(cursor.year, cursor.month);

  return (
    <div className="space-y-4">
      <PageHeader title="Reports" subtitle="Income, spending, and net worth. Open a category to see its transactions.">
        <MonthNav year={cursor.year} month={cursor.month} onChange={(year, month) => setCursor({ year, month })} />
      </PageHeader>

      <div className="shelf-panel grid grid-cols-3 divide-x divide-[var(--line)]">
        <Stat label="Income" cents={data.incomeCents} />
        <Stat label="Spending" cents={data.spendingCents} />
        <Stat label="Net worth" cents={data.netWorth.netWorthCents} />
      </div>
      <p className="text-[13px] text-[var(--muted)]">
        Assets <MoneyText cents={data.netWorth.assetsCents} /> · Debts <MoneyText cents={data.netWorth.liabilitiesCents} />
      </p>

      <section>
        <h2 className="ios-section">Flow</h2>
        <div className="shelf-panel px-2 py-3">
          <SankeyChart nodes={data.sankey.nodes.map((n) => ({ ...n, color: shelfColor(n.color) }))} links={data.sankey.links} />
        </div>
      </section>

      <section>
        <h2 className="ios-section">Spending</h2>
        <ul className="card">
          {data.byCategory.map((category) => (
            <li key={category.id || category.name}>
              <Link
                href={activityHref({ categoryId: category.id || undefined, start: range.start, end: range.end })}
                className="data-row justify-between gap-3"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: shelfColor(category.color) }} />
                  <span className="truncate">{category.name}</span>
                </span>
                <MoneyText className="shrink-0 text-[var(--muted)]" cents={category.cents} />
              </Link>
            </li>
          ))}
          {data.byCategory.length === 0 ? <li className="data-row text-[var(--muted)]">Nothing this month.</li> : null}
        </ul>
      </section>

      <section>
        <h2 className="ios-section">Net worth</h2>
        <div className="shelf-panel h-64 px-1 py-3">
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
              <Area type="monotone" dataKey="Worth" stroke="#1b7a62" fill="rgba(27,122,98,0.16)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
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
