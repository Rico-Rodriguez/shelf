"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MoneyText } from "@/components/MoneyText";
import { MonthNav } from "@/components/MonthNav";
import { ProgressBar } from "@/components/ProgressBar";
import { Drawer } from "@/components/ui/Drawer";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell, PageSkeleton } from "@/components/ui/PageShell";
import { api } from "@/lib/client";
import { activityHref } from "@/lib/activity";
import { addMonths, monthRange, yearMonth } from "@/lib/dates";
import { dollarsToCents, formatMoney } from "@/lib/money";
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
  usualCents: number;
};

type Handoff = {
  previousYear: number;
  previousMonth: number;
  previousLeftCents: number;
  rolledCents: number;
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
  pendingCents: number;
  handoff: Handoff | null;
  rows: Row[];
};

export default function BudgetPage() {
  const [cursor, setCursor] = useState<{ year?: number; month?: number }>({});
  const [income, setIncome] = useState("");
  const [planned, setPlanned] = useState("");
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Row | "income" | null>(null);
  const [readyOpen, setReadyOpen] = useState(false);
  const qs = cursor.year && cursor.month ? `?year=${cursor.year}&month=${cursor.month}` : "";
  const { data, loading, refreshing, reload } = useQuery<Budget>(`budget:${qs || "current"}`, `/api/budget${qs}`);

  useEffect(() => {
    if (!data?.handoff) return;
    const now = yearMonth();
    if (data.year !== now.year || data.month !== now.month) return;
    const key = `shelf-month-ready:${data.year}-${data.month}`;
    if (window.localStorage.getItem(key)) return;
    setReadyOpen(true);
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
  const range = monthRange(budget.year, budget.month);
  const editingRow = editing && editing !== "income" ? editing : null;

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

  async function setPlannedAmount(categoryId: string, plannedCents: number) {
    await api("/api/budget", {
      method: "PUT",
      body: JSON.stringify({ year: budget.year, month: budget.month, items: [{ categoryId, plannedCents }] }),
    });
    invalidateQueries("budget:");
    reload();
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

  function openIncome() {
    setIncome((budget.plannedIncomeCents / 100).toFixed(0));
    setEditing("income");
  }

  function openRow(row: Row) {
    setPlanned((row.plannedCents / 100).toFixed(0));
    setEditing(row);
  }

  function dismissReady() {
    window.localStorage.setItem(`shelf-month-ready:${budget.year}-${budget.month}`, "1");
    setReadyOpen(false);
  }

  return (
    <PageShell refreshing={refreshing}>
      <div className="space-y-4">
        <PageHeader title="Budget" subtitle={budgetSentence(budget)}>
          <MonthNav
            year={budget.year}
            month={budget.month}
            onChange={(year, month) => {
              void refreshMonth(year, month);
            }}
          />
        </PageHeader>

        <div className="grid grid-cols-2 gap-2">
          <button className="shelf-btn ghost w-full" type="button" onClick={copyLastMonth}>
            Use last month
          </button>
          <button className="shelf-btn ghost w-full" type="button" onClick={suggest}>
            Suggest
          </button>
        </div>

        <div className="card overflow-hidden">
          <div className="grid grid-cols-2">
            <button type="button" className="min-w-0 border-b border-r border-[var(--line)] px-3.5 py-3 text-left" onClick={openIncome}>
              <div className="field-label">Planned income</div>
              <div className="mt-1 truncate text-[22px]">
                <MoneyText figure cents={budget.plannedIncomeCents} />
              </div>
            </button>
            <div className="min-w-0 border-b border-[var(--line)] px-3.5 py-3">
              <div className="field-label">Left to budget</div>
              <div className="mt-1 truncate text-[22px]">
                <MoneyText figure cents={budget.leftoverCents} signed />
              </div>
            </div>
            <div className="min-w-0 border-r border-[var(--line)] px-3.5 py-3">
              <div className="field-label">Spent</div>
              <div className="mt-1 truncate text-[22px]">
                <MoneyText figure cents={budget.expenseSpentCents} />
              </div>
            </div>
            <div className="min-w-0 px-3.5 py-3">
              <div className="field-label">Planned</div>
              <div className="mt-1 truncate text-[22px]">
                <MoneyText figure cents={budget.expensePlannedCents} />
              </div>
            </div>
          </div>
        </div>
        {budget.pendingCents > 0 ? (
          <p className="text-[13px] text-[var(--muted)]">Pending {formatMoney(budget.pendingCents)} is not included.</p>
        ) : null}

        {groups.map((group) => {
          const plannedTotal = group.rows.reduce((sum, row) => sum + row.availableCents, 0);
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
                  <MoneyText cents={spent} /> / <MoneyText cents={plannedTotal} />
                </span>
              </button>
              {isClosed ? null : (
                <div className="card">
                  {group.rows.map((row) => (
                    <CategoryRow key={row.category.id} row={row} color={shelfColor(group.color)} onOpen={() => openRow(row)} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {editing === "income" ? (
        <Drawer title="Planned income" onClose={() => setEditing(null)}>
          <label className="field">
            <span className="field-label">Amount</span>
            <input
              className="shelf-input"
              inputMode="decimal"
              aria-label="Planned income"
              value={income}
              onChange={(event) => setIncome(event.target.value)}
              onBlur={() => void saveIncome()}
            />
          </label>
          <p className="text-[13px] text-[var(--muted)]">
            Actual income so far <MoneyText cents={budget.actualIncomeCents} />
          </p>
        </Drawer>
      ) : null}

      {editingRow ? (
        <Drawer title={editingRow.category.name} onClose={() => setEditing(null)}>
          <label className="field">
            <span className="field-label">Planned</span>
            <input
              className="shelf-input"
              inputMode="decimal"
              value={planned}
              onChange={(event) => setPlanned(event.target.value)}
              onBlur={() => {
                const next = dollarsToCents(planned || 0);
                if (next !== editingRow.plannedCents) void setPlannedAmount(editingRow.category.id, next);
              }}
            />
          </label>
          <button
            type="button"
            className="flex min-h-11 items-center justify-between gap-3 text-left"
            aria-pressed={editingRow.category.rollover}
            onClick={() => void toggleRollover(editingRow)}
          >
            <span>
              <span className="block font-medium">Rollover</span>
              <span className="block text-[13px] text-[var(--muted)]">Unused amounts carry into next month.</span>
            </span>
            <span className={`switch ${editingRow.category.rollover ? "on" : ""}`} />
          </button>
          <Link href={activityHref({ categoryId: editingRow.category.id, start: range.start, end: range.end })} className="text-link text-[15px]">
            See transactions
          </Link>
        </Drawer>
      ) : null}

      {readyOpen && budget.handoff ? (
        <Drawer title={`${monthLabel(budget.year, budget.month)} is ready`} onClose={dismissReady}>
          <p className="text-[15px]">
            {monthLabel(budget.handoff.previousYear, budget.handoff.previousMonth)} left{" "}
            <MoneyText cents={budget.handoff.previousLeftCents} />.
          </p>
          <p className="text-[15px] text-[var(--muted)]">
            {budget.handoff.rolledCents > 0 ? (
              <>
                <MoneyText cents={budget.handoff.rolledCents} /> rolled over.
              </>
            ) : (
              "Nothing rolled over."
            )}
          </p>
          <button className="shelf-btn w-full" type="button" onClick={dismissReady}>
            Done
          </button>
        </Drawer>
      ) : null}
    </PageShell>
  );
}

function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleString("en-US", { month: "long" });
}

function budgetSentence(budget: Budget) {
  if (budget.expensePlannedCents <= 0) return "Set a plan for this month.";
  const delta = budget.expensePlannedCents - budget.expenseSpentCents;
  if (delta >= 0) return `Spending is ${formatMoney(delta)} under the plan.`;
  return `Spending is ${formatMoney(-delta)} over the plan.`;
}

function usualLine(spent: number, usual: number) {
  if (usual <= 0) return null;
  const delta = usual - spent;
  const tolerance = Math.max(500, Math.round(usual * 0.08));
  if (Math.abs(delta) <= tolerance) return { text: "In line with usual", tone: "muted" as const };
  if (delta > 0) return { text: `${formatMoney(delta)} under usual`, tone: "muted" as const };
  return { text: `${formatMoney(-delta)} above usual`, tone: "over" as const };
}

function CategoryRow({ row, color, onOpen }: { row: Row; color: string; onOpen: () => void }) {
  const usual = usualLine(row.spentCents, row.usualCents);
  const noPlan = row.availableCents <= 0 && row.spentCents > 0;
  return (
    <button type="button" className="block w-full border-b border-[var(--line)] px-4 py-3.5 text-left last:border-0" onClick={onOpen}>
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 font-medium">{row.category.name}</span>
        <MoneyText className="shrink-0" cents={row.remainingCents} signed />
      </div>
      <div className="my-2.5">
        <ProgressBar value={row.spentCents} max={row.availableCents} color={color} />
      </div>
      {usual || noPlan ? (
        <p className={`text-[13px] ${usual?.tone === "over" || noPlan ? "text-[var(--danger)]" : "text-[var(--muted)]"}`}>
          {noPlan ? "No plan" : ""}
          {noPlan && usual ? " · " : ""}
          {usual?.text ?? ""}
        </p>
      ) : null}
    </button>
  );
}
