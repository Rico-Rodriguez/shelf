"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MoneyText } from "@/components/MoneyText";
import { MonthNav } from "@/components/MonthNav";
import { ProgressBar } from "@/components/ProgressBar";
import { Stat } from "@/components/Stat";
import { api } from "@/lib/client";
import { activityHref } from "@/lib/activity";
import { addMonths, monthRange } from "@/lib/dates";
import { dollarsToCents } from "@/lib/money";
import { shelfColor } from "@/lib/palette";

type Row = {
  category: { id: string; name: string; flexBucket: string | null; rollover: boolean; sortOrder: number };
  group: { id: string; name: string; color: string; sortOrder: number } | null;
  plannedCents: number;
  rolloverInCents: number;
  availableCents: number;
  spentCents: number;
  remainingCents: number;
};

type Budget = {
  year: number;
  month: number;
  mode: "category" | "flex";
  plannedIncomeCents: number;
  actualIncomeCents: number;
  leftoverCents: number;
  expensePlannedCents: number;
  expenseSpentCents: number;
  rows: Row[];
  flex: { fixed: Row[]; non_monthly: Row[]; flex: Row[] };
};

export default function BudgetPage() {
  const [data, setData] = useState<Budget | null>(null);
  const [income, setIncome] = useState("");
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  const load = useCallback((year?: number, month?: number) => {
    const qs = year && month ? `?year=${year}&month=${month}` : "";
    void api<Budget>(`/api/budget${qs}`).then((b) => {
      setData(b);
      setIncome((b.plannedIncomeCents / 100).toFixed(0));
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { id: string; name: string; color: string; sortOrder: number; rows: Row[] }>();
    for (const row of data.rows) {
      const id = row.group?.id ?? "other";
      const bucket = map.get(id) ?? {
        id,
        name: row.group?.name ?? "Other",
        color: row.group?.color ?? "#9A8B7A",
        sortOrder: row.group?.sortOrder ?? 99,
        rows: [],
      };
      bucket.rows.push(row);
      map.set(id, bucket);
    }
    return [...map.values()]
      .map((group) => ({ ...group, rows: group.rows.sort((a, b) => a.category.sortOrder - b.category.sortOrder) }))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [data]);

  if (!data) return <p className="text-[var(--muted)]">Loading…</p>;

  async function saveIncome() {
    const plannedIncomeCents = dollarsToCents(income);
    if (plannedIncomeCents === data!.plannedIncomeCents) return;
    await api("/api/budget", {
      method: "PUT",
      body: JSON.stringify({ year: data!.year, month: data!.month, plannedIncomeCents }),
    });
    load(data!.year, data!.month);
  }

  async function setMode(mode: "category" | "flex") {
    if (mode === data!.mode) return;
    await api("/api/budget", { method: "PUT", body: JSON.stringify({ year: data!.year, month: data!.month, mode }) });
    load(data!.year, data!.month);
  }

  async function saveItems(items: { categoryId: string; plannedCents: number }[]) {
    await api("/api/budget", {
      method: "PUT",
      body: JSON.stringify({ year: data!.year, month: data!.month, items }),
    });
    load(data!.year, data!.month);
  }

  async function setPlanned(categoryId: string, plannedCents: number) {
    await saveItems([{ categoryId, plannedCents }]);
  }

  async function suggest() {
    await api("/api/budget", { method: "POST", body: JSON.stringify({ year: data!.year, month: data!.month, apply: true }) });
    load(data!.year, data!.month);
  }

  async function copyLastMonth() {
    const prev = addMonths(data!.year, data!.month, -1);
    const previous = await api<Budget>(`/api/budget?year=${prev.year}&month=${prev.month}`);
    await api("/api/budget", {
      method: "PUT",
      body: JSON.stringify({
        year: data!.year,
        month: data!.month,
        plannedIncomeCents: previous.plannedIncomeCents,
        items: previous.rows.map((row) => ({ categoryId: row.category.id, plannedCents: row.plannedCents })),
      }),
    });
    load(data!.year, data!.month);
  }

  async function toggleRollover(row: Row) {
    await api("/api/categories", {
      method: "PATCH",
      body: JSON.stringify({ id: row.category.id, rollover: !row.category.rollover }),
    });
    load(data!.year, data!.month);
  }

  async function saveFlexTotal(cents: number) {
    const rows = data!.flex.flex;
    if (!rows.length) return;
    const current = rows.reduce((sum, row) => sum + row.plannedCents, 0);
    if (current <= 0) {
      await saveItems(rows.map((row, index) => ({ categoryId: row.category.id, plannedCents: index === 0 ? cents : row.plannedCents })));
      return;
    }
    const scaled = rows.map((row) => ({
      categoryId: row.category.id,
      plannedCents: Math.floor((row.plannedCents / current) * cents),
      weight: row.plannedCents,
    }));
    let remainder = cents - scaled.reduce((sum, row) => sum + row.plannedCents, 0);
    const order = [...scaled].sort((a, b) => b.weight - a.weight);
    for (const row of order) {
      if (remainder <= 0) break;
      row.plannedCents += 1;
      remainder -= 1;
    }
    await saveItems(scaled.map(({ categoryId, plannedCents }) => ({ categoryId, plannedCents })));
  }

  const range = monthRange(data.year, data.month);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Budget</h1>
          <p>Income in, categories planned, leftover unassigned.</p>
        </div>
        <MonthNav year={data.year} month={data.month} onChange={load} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="ios-seg w-full max-w-xs">
          <button type="button" className={data.mode === "category" ? "active" : ""} onClick={() => setMode("category")}>
            Category
          </button>
          <button type="button" className={data.mode === "flex" ? "active" : ""} onClick={() => setMode("flex")}>
            Flex
          </button>
        </div>
        <button className="pixel-btn ghost" type="button" onClick={copyLastMonth}>
          Use last month
        </button>
        <button className="pixel-btn ghost" type="button" onClick={suggest}>
          Suggest
        </button>
      </div>

      <div className="pixel-panel grid grid-cols-2 divide-y divide-[var(--line)] sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        <label className="min-w-0 px-4 py-3">
          <span className="text-[13px] leading-[18px] text-[var(--muted)]">Income</span>
          <input
            className="pixel-input mt-1"
            inputMode="decimal"
            aria-label="Planned income"
            value={income}
            onChange={(e) => setIncome(e.target.value)}
            onBlur={saveIncome}
          />
        </label>
        <Stat label="Budgeted" cents={data.expensePlannedCents} />
        <Stat label="Spent" cents={data.expenseSpentCents} />
        <Stat label="Left to budget" cents={data.leftoverCents} signed />
      </div>
      <p className="text-[13px] text-[var(--muted)]">
        Actual income <MoneyText cents={data.actualIncomeCents} />
      </p>

      {data.mode === "flex" ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Bucket title="Fixed" rows={rowsOf(data.flex.fixed)} range={range} onSave={setPlanned} onRollover={toggleRollover} />
          <Bucket title="Non-monthly" rows={rowsOf(data.flex.non_monthly)} range={range} onSave={setPlanned} onRollover={toggleRollover} />
          <FlexPot rows={data.flex.flex} range={range} onSave={saveFlexTotal} />
        </div>
      ) : (
        groups.map((group) => {
          const planned = group.rows.reduce((sum, row) => sum + row.availableCents, 0);
          const spent = group.rows.reduce((sum, row) => sum + row.spentCents, 0);
          const isClosed = closed[group.id] ?? false;
          return (
            <section key={group.id}>
              <button
                type="button"
                className="ios-section flex w-[calc(100%-32px)] items-center justify-between"
                onClick={() => setClosed({ ...closed, [group.id]: !isClosed })}
              >
                <span>{group.name}</span>
                <span>
                  <MoneyText cents={spent} /> / <MoneyText cents={planned} />
                </span>
              </button>
              {isClosed ? null : (
                <div className="ios-group">
                  {group.rows.map((row) => (
                    <CategoryRow key={row.category.id} row={row} range={range} color={shelfColor(group.color)} onSave={setPlanned} onRollover={toggleRollover} />
                  ))}
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}

function rowsOf(rows: Row[]) {
  return [...rows].sort((a, b) => a.category.sortOrder - b.category.sortOrder);
}

function CategoryRow({
  row,
  range,
  color,
  onSave,
  onRollover,
}: {
  row: Row;
  range: { start: string; end: string };
  color: string;
  onSave: (id: string, cents: number) => void;
  onRollover: (row: Row) => void;
}) {
  return (
    <div className="border-b border-[var(--line)] px-4 py-3 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <Link href={activityHref({ categoryId: row.category.id, start: range.start, end: range.end })} className="font-medium">
          {row.category.name}
        </Link>
        <MoneyText cents={row.remainingCents} signed />
      </div>
      <div className="my-2">
        <ProgressBar value={row.spentCents} max={row.availableCents || 1} color={color} />
      </div>
      <div className="flex items-center gap-3">
        <label className="text-[13px] text-[var(--muted)]">
          Planned
          <input
            className="pixel-input mt-1 w-28"
            inputMode="decimal"
            defaultValue={(row.plannedCents / 100).toFixed(0)}
            key={`${row.category.id}-${row.plannedCents}`}
            onBlur={(e) => {
              const next = dollarsToCents(e.target.value || 0);
              if (next !== row.plannedCents) onSave(row.category.id, next);
            }}
          />
        </label>
        <button type="button" className="ml-auto flex items-center gap-2 text-[13px] text-[var(--muted)]" aria-pressed={row.category.rollover} onClick={() => onRollover(row)}>
          Rolls over
          <span className={`switch ${row.category.rollover ? "on" : ""}`} />
        </button>
      </div>
    </div>
  );
}

function Bucket({
  title,
  rows,
  range,
  onSave,
  onRollover,
}: {
  title: string;
  rows: Row[];
  range: { start: string; end: string };
  onSave: (id: string, cents: number) => void;
  onRollover: (row: Row) => void;
}) {
  const planned = rows.reduce((sum, row) => sum + row.availableCents, 0);
  const spent = rows.reduce((sum, row) => sum + row.spentCents, 0);
  return (
    <section className="pixel-panel p-4">
      <h2 className="text-[17px] font-semibold">{title}</h2>
      <p className="my-2 text-[15px]">
        <MoneyText cents={spent} /> / <MoneyText cents={planned} />
      </p>
      <ProgressBar value={spent} max={planned || 1} />
      <div className="mt-3">
        {rows.map((row) => (
          <CategoryRow key={row.category.id} row={row} range={range} color="var(--sage)" onSave={onSave} onRollover={onRollover} />
        ))}
      </div>
    </section>
  );
}

function FlexPot({
  rows,
  range,
  onSave,
}: {
  rows: Row[];
  range: { start: string; end: string };
  onSave: (cents: number) => void;
}) {
  const planned = rows.reduce((sum, row) => sum + row.plannedCents, 0);
  const spent = rows.reduce((sum, row) => sum + row.spentCents, 0);
  return (
    <section className="pixel-panel p-4">
      <h2 className="text-[17px] font-semibold">Flex</h2>
      <p className="my-2 text-[13px] text-[var(--muted)]">One amount for everything in this bucket.</p>
      <label className="text-[13px] text-[var(--muted)]">
        Flex budget
        <input
          className="pixel-input mt-1"
          inputMode="decimal"
          key={planned}
          defaultValue={(planned / 100).toFixed(0)}
          onBlur={(e) => {
            const next = dollarsToCents(e.target.value || 0);
            if (next !== planned) onSave(next);
          }}
        />
      </label>
      <p className="my-2 text-[15px]">
        <MoneyText cents={spent} /> / <MoneyText cents={planned} />
      </p>
      <ProgressBar value={spent} max={planned || 1} />
      <ul className="mt-3">
        {rows.map((row) => (
          <li key={row.category.id} className="flex items-center justify-between gap-3 py-1.5 text-[15px]">
            <Link href={activityHref({ categoryId: row.category.id, start: range.start, end: range.end })}>{row.category.name}</Link>
            <MoneyText cents={row.spentCents} />
          </li>
        ))}
      </ul>
    </section>
  );
}
