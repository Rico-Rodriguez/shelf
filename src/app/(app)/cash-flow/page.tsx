"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MoneyText } from "@/components/MoneyText";
import { api } from "@/lib/client";

type Flow = {
  series: { key: string; income: number; spending: number; savings: number }[];
  byCategory: Record<string, number>;
  byMerchant: Record<string, number>;
};

type Point = { name: string; Income: number; Spending: number; Saved: number };

const SERIES = [
  { key: "Income", color: "#34C759" },
  { key: "Saved", color: "#007AFF" },
  { key: "Spending", color: "#E15A3A" },
] as const;

const tick = { fill: "rgba(60, 60, 67, 0.6)", fontSize: 11 };

export default function CashFlowPage() {
  const [data, setData] = useState<Flow | null>(null);
  const [grain, setGrain] = useState("month");
  const [merchant, setMerchant] = useState("");

  useEffect(() => {
    const qs = new URLSearchParams({ grain, months: "12" });
    if (merchant) qs.set("merchant", merchant);
    void api<Flow>(`/api/cash-flow?${qs}`).then(setData);
  }, [grain, merchant]);

  if (!data) return <p className="pixel-title">Watching the current…</p>;

  const chart = visible(
    data.series.map((s) => ({
      name: s.key,
      Income: s.income / 100,
      Spending: s.spending / 100,
      Saved: s.savings / 100,
    })),
  );
  const multiYear = new Set(chart.map((d) => d.name.slice(0, 4))).size > 1;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="pixel-title">Cash flow</h1>
        <p>What came in, what went out, what stayed in the jar.</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="ios-seg sm:w-56">
          <button type="button" className={grain === "month" ? "active" : ""} onClick={() => setGrain("month")}>
            Monthly
          </button>
          <button type="button" className={grain === "quarter" ? "active" : ""} onClick={() => setGrain("quarter")}>
            Quarterly
          </button>
        </div>
        <input
          className="pixel-input ios-search sm:max-w-xs"
          placeholder="Filter merchant"
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
        />
      </div>
      <div className="pixel-panel px-1 pb-3 pt-2">
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} barGap={3} barCategoryGap="28%" margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="rgba(60,60,67,0.1)" />
              <XAxis
                dataKey="name"
                tick={tick}
                axisLine={false}
                tickLine={false}
                tickFormatter={(key: string) => axisLabel(key, multiYear)}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={tick}
                axisLine={false}
                tickLine={false}
                width={48}
                tickFormatter={axisMoney}
              />
              <Tooltip content={<FlowTip />} cursor={{ fill: "rgba(120,120,128,0.08)" }} />
              {SERIES.map((s) => (
                <Bar key={s.key} dataKey={s.key} fill={s.color} maxBarSize={28} radius={[3, 3, 3, 3]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-1 flex items-center justify-center gap-4">
          {SERIES.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5 text-[12px] text-[var(--muted)]">
              <span className="size-2 rounded-[2px]" style={{ background: s.color }} />
              {s.key}
            </span>
          ))}
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <List title="By shelf" rows={data.byCategory} />
        <List title="By shop" rows={data.byMerchant} />
      </div>
    </div>
  );
}

function List({ title, rows }: { title: string; rows: Record<string, number> }) {
  const sorted = Object.entries(rows).sort((a, b) => b[1] - a[1]).slice(0, 12);
  return (
    <section>
      <h2 className="ios-section">{title}</h2>
      <ul className="ios-group">
        {sorted.map(([name, cents]) => (
          <li key={name} className="ios-row justify-between gap-3">
            <span className="min-w-0 truncate">{name}</span>
            <MoneyText className="shrink-0 text-[var(--muted)]" cents={cents} />
          </li>
        ))}
        {sorted.length === 0 ? <li className="ios-row text-[var(--muted)]">Nothing yet.</li> : null}
      </ul>
    </section>
  );
}

function visible(chart: Point[]) {
  const first = chart.findIndex((d) => d.Income || d.Spending || d.Saved);
  if (first === -1) return chart.slice(-6);
  return chart.slice(first);
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

function axisLabel(key: string, multiYear: boolean) {
  const month = /^(\d{4})-(\d{2})$/.exec(key);
  if (!month) return key.replace("-", " ");
  const short = new Date(Number(month[1]), Number(month[2]) - 1, 1).toLocaleString("en-US", { month: "short" });
  return multiYear ? `${short} ’${month[1].slice(2)}` : short;
}

function tipLabel(key: string) {
  const month = /^(\d{4})-(\d{2})$/.exec(key);
  if (!month) return key.replace("-", " ");
  return new Date(Number(month[1]), Number(month[2]) - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function usd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function FlowTip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[22px] bg-white px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),inset_0_0_0_0.5px_rgba(0,0,0,0.12),0_8px_28px_rgba(0,0,0,0.10)]">
      <div className="mb-1 text-[13px] font-semibold tracking-[-0.08px]">{tipLabel(String(label ?? ""))}</div>
      {payload.map((row) => (
        <div key={row.name} className="flex items-center justify-between gap-4 text-[13px] leading-[18px]">
          <span style={{ color: row.color }}>{row.name}</span>
          <span className="tabular-nums">{usd(Number(row.value ?? 0))}</span>
        </div>
      ))}
    </div>
  );
}
