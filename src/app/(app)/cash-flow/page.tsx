"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MoneyText } from "@/components/MoneyText";
import { PageHeader } from "@/components/ui/PageHeader";
import { Segment } from "@/components/ui/Segment";
import { api } from "@/lib/client";
import { activityHref } from "@/lib/activity";
import { periodRange } from "@/lib/dates";

type Row = { id?: string; name: string; cents: number };

type Flow = {
  series: { key: string; income: number; spending: number; savings: number }[];
  byCategory: Row[];
  byMerchant: Row[];
};

type Point = { name: string; Income: number; Spending: number; Saved: number };

const SERIES = [
  { key: "Income", color: "#1f7a45" },
  { key: "Saved", color: "#1f4d45" },
  { key: "Spending", color: "#b23b32" },
] as const;

function SavingsRate({ series }: { series: { income: number; spending: number }[] }) {
  const income = series.reduce((sum, row) => sum + row.income, 0);
  const spending = series.reduce((sum, row) => sum + row.spending, 0);
  const rate = income > 0 ? Math.round(((income - spending) / income) * 100) : null;
  return (
    <p className="text-[14px] text-[var(--muted)]">
      Savings rate {rate == null ? "—" : `${rate}%`} over this range
    </p>
  );
}

const tick = { fill: "rgba(60, 60, 67, 0.6)", fontSize: 11 };

export default function CashFlowPage() {
  const router = useRouter();
  const [data, setData] = useState<Flow | null>(null);
  const [grain, setGrain] = useState("month");
  const [merchant, setMerchant] = useState("");

  useEffect(() => {
    const qs = new URLSearchParams({ grain, months: "12" });
    if (merchant) qs.set("merchant", merchant);
    void api<Flow>(`/api/cash-flow?${qs}`).then(setData);
  }, [grain, merchant]);

  if (!data) return <p className="text-[var(--muted)]">Loading…</p>;

  const chart = visible(
    data.series.map((s) => ({
      name: s.key,
      Income: s.income / 100,
      Spending: s.spending / 100,
      Saved: s.savings / 100,
    })),
  );
  const multiYear = new Set(chart.map((d) => d.name.slice(0, 4))).size > 1;
  const span = spanOf(data.series.map((row) => row.key));

  function openPeriod(key: string) {
    const range = periodRange(key);
    if (!range) return;
    router.push(activityHref(range));
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Cash flow" subtitle="What came in, what went out, and what was left. Open a month or a row to see the transactions." />
      <SavingsRate series={data.series} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Segment
          className="sm:w-56"
          value={grain}
          onChange={(value) => setGrain(value as "month" | "quarter")}
          options={[
            { value: "month", label: "Monthly" },
            { value: "quarter", label: "Quarterly" },
          ]}
        />
        <input
          className="pixel-input ios-search sm:max-w-xs"
          placeholder="Filter merchant"
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
          aria-label="Filter merchant"
        />
      </div>
      <div className="pixel-panel px-1 pb-3 pt-2">
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chart}
              barGap={3}
              barCategoryGap="28%"
              margin={{ top: 12, right: 8, left: 0, bottom: 0 }}
              onClick={(state) => {
                const key = state?.activeLabel;
                if (typeof key === "string") openPeriod(key);
              }}
            >
              <CartesianGrid vertical={false} stroke="rgba(60,60,67,0.1)" />
              <XAxis
                dataKey="name"
                tick={tick}
                axisLine={false}
                tickLine={false}
                tickFormatter={(key: string) => axisLabel(key, multiYear)}
                interval="preserveStartEnd"
              />
              <YAxis tick={tick} axisLine={false} tickLine={false} width={48} tickFormatter={axisMoney} />
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
        <List
          title="By category"
          rows={data.byCategory}
          hrefFor={(row) => activityHref({ categoryId: row.id || undefined, ...span })}
        />
        <List title="By merchant" rows={data.byMerchant} hrefFor={(row) => activityHref({ q: row.name, ...span })} />
      </div>
    </div>
  );
}

function spanOf(keys: string[]): { start?: string; end?: string } {
  if (!keys.length) return {};
  const first = periodRange(keys[0]);
  const last = periodRange(keys[keys.length - 1]);
  if (!first || !last) return {};
  return { start: first.start, end: last.end };
}

function List({ title, rows, hrefFor }: { title: string; rows: Row[]; hrefFor: (row: Row) => string }) {
  const sorted = rows.slice(0, 12);
  return (
    <section>
      <h2 className="ios-section">{title}</h2>
      <ul className="card">
        {sorted.map((row) => (
          <li key={row.id || row.name}>
            <Link href={hrefFor(row)} className="data-row justify-between gap-3">
              <span className="min-w-0 truncate">{row.name}</span>
              <MoneyText className="shrink-0 text-[var(--muted)]" cents={row.cents} />
            </Link>
          </li>
        ))}
        {sorted.length === 0 ? <li className="data-row text-[var(--muted)]">Nothing yet.</li> : null}
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
