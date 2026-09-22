"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MoneyText } from "@/components/MoneyText";
import { MonthNav } from "@/components/MonthNav";
import { ProgressBar } from "@/components/ProgressBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell, PageSkeleton } from "@/components/ui/PageShell";
import { Segment } from "@/components/ui/Segment";
import { api } from "@/lib/client";
import { activityHref } from "@/lib/activity";
import { addMonths, monthRange } from "@/lib/dates";
import { dollarsToCents } from "@/lib/money";
import { shelfColor } from "@/lib/palette";
import { invalidateQueries, useQuery } from "@/lib/use-query";

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
  flexPoolCents: number;
  flexSpentCents: number;
  flexRemainingCents: number;
  actualIncomeCents: number;
  leftoverCents: number;
  expensePlannedCents: number;
  expenseSpentCents: number;
  rows: Row[];
  flex: { fixed: Row[]; non_monthly: Row[]; flex: Row[] };
};

export default function BudgetPage() {
  const [cursor, setCursor] = useState<{ year?: number; month?: number }>({});
  const [income, setIncome] = useState("");
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const qs = cursor.year && cursor.month ? `?year=${cursor.year}&month=${cursor.month}` : "";
  const { data, loading, refreshing, reload } = useQuery<Budget>(`budget:${qs || "current"}`, `/api/budget${qs}`);

  useEffect(() => {
    if (data) setIncome((data.plannedIncomeCents / 100).toFixed(0));
  }, [data]);

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

  if (!data && loading) return <PageSkeleton title="Budget" rows={6} />;
  if (!data) return <PageSkeleton title="Budget" rows={6} />;

  const budget = data;

  async function refreshMonth(year: number, month: number) {
    setCursor({ year, month });
  }

  async function saveIncome() {
    const plannedIncomeCents = dollarsToCents(income);
    if (plannedIncomeCents === budget.plannedIncomeCents) return;
    await api("/api/budget", {
      method: "PUT",
      body: JSON.stringify({ year: budget.year, month: budget.month, plannedIncomeCents }),
    });
    invalidateQueries("budget:");
    reload();
  }

  async function setMode(mode: "category" | "flex") {
    if (mode === budget.mode) return;
    await api("/api/budget", { method: "PUT", body: JSON.stringify({ year: budget.year, month: budget.month, mode }) });
    invalidateQueries("budget:");
    reload();
  }

  async function saveItems(items: { categoryId: string; plannedCents: number }[]) {
    await api("/api/budget", {
      method: "PUT",
      body: JSON.stringify({ year: budget.year, month: budget.month, items }),
    });
    invalidateQueries("budget:");
    reload();
  }

  async function setPlanned(categoryId: string, plannedCents: number) {
    await saveItems([{ categoryId, plannedCents }]);
  }

  async function suggest() {
    await api("/api/budget", { method: "POST", body: JSON.stringify({ year: budget.year, month: budget.month, apply: true }) });
    invalidateQueries("budget:");
    reload();
  }

  async function copyLastMonth() {
    const prev = addMonths(budget.year, budget.month, -1);
    const previous = await api<Budget>(`/api/budget?year=${prev.year}&month=${prev.month}`);
    await api("/api/budget", {
      method: "PUT",
      body: JSON.stringify({
        year: budget.year,
        month: budget.month,
        plannedIncomeCents: previous.plannedIncomeCents,
        flexPoolCents: previous.flexPoolCents,
        items: previous.rows.map((row) => ({ categoryId: row.category.id, plannedCents: row.plannedCents })),
      }),
    });
    invalidateQueries("budget:");
    reload();
  }

  async function toggleRollover(row: Row) {
    await api("/api/categories", {
      method: "PATCH",
      body: JSON.stringify({ id: row.category.id, rollover: !row.category.rollover }),
    });
    invalidateQueries("budget:");
    reload();
  }

  async function saveFlexTotal(cents: number) {
    await api("/api/budget", {
      method: "PUT",
      body: JSON.stringify({ year: budget.year, month: budget.month, flexPoolCents: cents }),
    });
    invalidateQueries("budget:");
    reload();
  }

  const range = monthRange(budget.year, budget.month);

  return (
    <PageShell refreshing={refreshing}>
      <div className="space-y-4">
        <PageHeader title="Budget" subtitle="Set a plan, then watch spending land in each category.">
          <MonthNav
            year={budget.year}
            month={budget.month}
            onChange={(year, month) => {
              void refreshMonth(year, month);
            }}
          />
        </PageHeader>

        <p className="story-line">
          {budget.mode === "flex"
            ? `${budget.flexRemainingCents >= 0 ? "Flex pot still has room." : "The flex pot is spent."} Rollover categories keep unused amounts for next month.`
            : budget.expensePlannedCents > 0
              ? budget.expenseSpentCents > budget.expensePlannedCents
                ? "A few categories are past their plan. Open one and lower it, or move the extra into flex."
                : "You are inside the category plan. Leftover amounts stay put unless rollover is on."
              : "No amounts yet. Suggest from recent history, or copy last month to start the ritual."}
        </p>

        <div className="flex flex-col gap-2">
          <Segment
            className="w-full"
            value={budget.mode}
            onChange={(value) => setMode(value as "category" | "flex")}
            options={[
              { value: "category", label: "By category" },
              { value: "flex", label: "Flex pot" },
            ]}
          />
          <div className="grid grid-cols-2 gap-2">
            <button className="shelf-btn ghost w-full" type="button" onClick={copyLastMonth}>
              Use last month
            </button>
            <button className="shelf-btn ghost w-full" type="button" onClick={suggest}>
              Suggest
            </button>
          </div>
        </div>

        <div className="shelf-panel overflow-hidden">
          <div className="grid grid-cols-2">
            <label className="field min-w-0 border-b border-r border-[var(--line)] px-3.5 py-3">
              <span className="field-label">Planned income</span>
              <input
                className="shelf-input compact mt-1.5"
                inputMode="decimal"
                aria-label="Planned income"
                value={income}
                onChange={(e) => setIncome(e.target.value)}
                onBlur={saveIncome}
              />
            </label>
            <div className="min-w-0 border-b border-[var(--line)] px-3.5 py-3">
              <div className="field-label">Budgeted</div>
              <div className="mt-1 truncate text-[22px] font-semibold tracking-[-0.03em] tabular-nums">
                <MoneyText cents={budget.expensePlannedCents} />
              </div>
            </div>
            <div className="min-w-0 border-r border-[var(--line)] px-3.5 py-3">
              <div className="field-label">Spent</div>
              <div className="mt-1 truncate text-[22px] font-semibold tracking-[-0.03em] tabular-nums">
                <MoneyText cents={budget.expenseSpentCents} />
              </div>
            </div>
            <div className="min-w-0 px-3.5 py-3">
              <div className="field-label">Left to budget</div>
              <div className="mt-1 truncate text-[22px] font-semibold tracking-[-0.03em] tabular-nums">
                <MoneyText cents={budget.leftoverCents} signed />
              </div>
            </div>
          </div>
        </div>
        <p className="text-[13px] text-[var(--muted)]">
          Actual income <MoneyText cents={budget.actualIncomeCents} />
        </p>

        {budget.mode === "flex" ? (
          <div className="grid gap-4 md:grid-cols-3">
            <Bucket title="Fixed" rows={rowsOf(budget.flex.fixed)} range={range} onSave={setPlanned} onRollover={toggleRollover} />
            <Bucket title="Non-monthly" rows={rowsOf(budget.flex.non_monthly)} range={range} onSave={setPlanned} onRollover={toggleRollover} />
            <FlexPot pool={budget.flexPoolCents} spent={budget.flexSpentCents} rows={budget.flex.flex} range={range} onSave={saveFlexTotal} />
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
                  className="ios-section flex w-full items-center justify-between gap-3"
                  onClick={() => setClosed({ ...closed, [group.id]: !isClosed })}
                >
                  <span>{group.name}</span>
                  <span className="tabular-nums">
                    <MoneyText cents={spent} /> / <MoneyText cents={planned} />
                  </span>
                </button>
                {isClosed ? null : (
                  <div className="card">
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
    </PageShell>
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
    <div className="border-b border-[var(--line)] px-4 py-3.5 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <Link href={activityHref({ categoryId: row.category.id, start: range.start, end: range.end })} className="min-w-0 font-medium">
          {row.category.name}
        </Link>
        <MoneyText className="shrink-0" cents={row.remainingCents} signed />
      </div>
      <div className="my-2.5">
        <ProgressBar value={row.spentCents} max={row.availableCents || 1} color={color} />
      </div>
      <div className="flex items-end gap-3">
        <label className="field min-w-0 flex-1">
          <span className="field-label">Planned</span>
          <input
            className="shelf-input compact mt-1"
            inputMode="decimal"
            defaultValue={(row.plannedCents / 100).toFixed(0)}
            key={`${row.category.id}-${row.plannedCents}`}
            onBlur={(e) => {
              const next = dollarsToCents(e.target.value || 0);
              if (next !== row.plannedCents) onSave(row.category.id, next);
            }}
          />
        </label>
        <button
          type="button"
          className="mb-0.5 flex min-h-10 shrink-0 items-center gap-2 pb-0.5 text-[13px] text-[var(--muted)]"
          aria-pressed={row.category.rollover}
          onClick={() => onRollover(row)}
        >
          Rollover
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
    <section className="shelf-panel p-4">
      <h2 className="text-[17px] font-semibold">{title}</h2>
      <p className="my-2 text-[15px]">
        <MoneyText cents={spent} /> / <MoneyText cents={planned} />
      </p>
      <ProgressBar value={spent} max={planned || 1} />
      <div className="mt-3">
        {rows.map((row) => (
          <CategoryRow key={row.category.id} row={row} range={range} color="var(--positive)" onSave={onSave} onRollover={onRollover} />
        ))}
      </div>
    </section>
  );
}

function FlexPot({
  pool,
  spent,
  rows,
  range,
  onSave,
}: {
  pool: number;
  spent: number;
  rows: Row[];
  range: { start: string; end: string };
  onSave: (cents: number) => void;
}) {
  const planned = pool;
  return (
    <section className="shelf-panel p-4">
      <h2 className="text-[17px] font-semibold">Flex</h2>
      <p className="my-2 text-[13px] text-[var(--muted)]">One amount for everything in this bucket.</p>
      <label className="field">
        <span className="field-label">Flex budget</span>
        <input
          className="shelf-input compact mt-1"
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
