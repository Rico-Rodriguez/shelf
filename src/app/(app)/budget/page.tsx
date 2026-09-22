"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { MoneyText } from "@/components/MoneyText";
import { MonthNav } from "@/components/MonthNav";
import { ProgressBar } from "@/components/ProgressBar";
import { Sheet } from "@/components/Sheet";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell, PageSkeleton } from "@/components/ui/PageShell";
import { seriesFromZero, SummaryCard, type SummaryTone } from "@/components/ui/SummaryCard";
import { api } from "@/lib/client";
import { activityHref } from "@/lib/activity";
import { addMonths, monthName, monthRange, yearMonth } from "@/lib/dates";
import { dollarsToCents } from "@/lib/money";
import { budgetPace } from "@/lib/plan";
import { shelfColor } from "@/lib/palette";
import { versusShort, versusStatus } from "@/lib/voice";
import { invalidateQueries, useQuery } from "@/lib/use-query";

type Row = {
  category: { id: string; name: string; flexBucket: string | null; rollover: boolean; sortOrder: number; groupId?: string };
  group: { id: string; name: string; color: string; sortOrder: number } | null;
  plannedCents: number;
  rolloverInCents: number;
  availableCents: number;
  spentCents: number;
  remainingCents: number;
  usualCents?: number | null;
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
  pendingCents?: number;
  usualSpentCents?: number | null;
  spendSeries?: { date: string; cents: number }[];
  rows: Row[];
  flex: { fixed: Row[]; non_monthly: Row[]; flex: Row[] };
};

type Editor =
  | { kind: "row"; row: Row; planned: string; name: string; rollover: boolean }
  | { kind: "flex"; amount: string }
  | { kind: "add"; groupId: string; name: string }
  | null;

export default function BudgetPage() {
  const [cursor, setCursor] = useState<{ year?: number; month?: number }>({});
  const [income, setIncome] = useState("");
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [moving, setMoving] = useState(false);
  const [moveForm, setMoveForm] = useState({ from: "", to: "", amount: "" });
  const [editor, setEditor] = useState<Editor>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [groupsList, setGroupsList] = useState<{ id: string; name: string }[]>([]);
  const [closeMonth, setCloseMonth] = useState<Budget | null>(null);
  const askedClose = useRef(false);
  const qs = cursor.year && cursor.month ? `?year=${cursor.year}&month=${cursor.month}` : "";
  const { data, loading, reload } = useQuery<Budget>(`budget:${qs || "current"}`, `/api/budget${qs}`, { keepPrevious: true });

  useEffect(() => {
    if (data) setIncome((data.plannedIncomeCents / 100).toFixed(0));
  }, [data]);

  useEffect(() => {
    if (!data || askedClose.current) return;
    const now = yearMonth();
    if (data.year !== now.year || data.month !== now.month) return;
    const key = `shelf-month-close-${data.year}-${data.month}`;
    if (window.localStorage.getItem(key)) return;
    askedClose.current = true;
    const prev = addMonths(data.year, data.month, -1);
    void api<Budget>(`/api/budget?year=${prev.year}&month=${prev.month}`).then((previous) => {
      if (previous.expensePlannedCents <= 0 && previous.expenseSpentCents <= 0) return;
      setCloseMonth(previous);
    });
  }, [data]);

  const flexRows = useMemo(() => data?.rows.filter((row) => row.category.flexBucket === "flex") ?? [], [data]);
  const groups = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { id: string; name: string; color: string; sortOrder: number; rows: Row[] }>();
    for (const row of data.rows) {
      if (row.category.flexBucket === "flex") continue;
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
      .filter((group) => group.rows.length > 0)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [data]);

  if (!data && loading) return <PageSkeleton title="Budget" rows={6} />;
  if (!data) return <PageSkeleton title="Budget" rows={6} />;

  const budget = data;
  const flexPlan = budget.flexPoolCents > 0 ? budget.flexPoolCents : flexRows.reduce((sum, row) => sum + row.availableCents, 0);
  const flexSpent = flexRows.reduce((sum, row) => sum + row.spentCents, 0);
  const flexUsual = flexRows.some((row) => row.usualCents != null)
    ? flexRows.reduce((sum, row) => sum + (row.usualCents ?? 0), 0)
    : null;
  const range = monthRange(budget.year, budget.month);

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

  async function suggest() {
    await api("/api/budget", { method: "POST", body: JSON.stringify({ year: budget.year, month: budget.month, apply: true }) });
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

  function dismissClose() {
    window.localStorage.setItem(`shelf-month-close-${budget.year}-${budget.month}`, "1");
    setCloseMonth(null);
  }

  async function openAdd() {
    const res = await api<{ groups: { id: string; name: string }[] }>("/api/categories");
    setGroupsList(res.groups);
    setEditor({ kind: "add", groupId: res.groups[0]?.id ?? "", name: "" });
  }

  const rolled = closeMonth?.rows.filter((row) => row.category.rollover && row.remainingCents > 0) ?? [];

  return (
    <PageShell>
      <div className="space-y-4">
        <PageHeader title="Budget">
          <MonthNav
            year={budget.year}
            month={budget.month}
            onChange={(year, month) => {
              void refreshMonth(year, month);
            }}
          />
          <button className="text-btn" type="button" onClick={() => setPlanOpen(true)}>
            Edit
          </button>
        </PageHeader>

        <BudgetSummary budget={budget} income={income} setIncome={setIncome} saveIncome={saveIncome} />

        {groups.map((group) => {
          const planned = group.rows.reduce((sum, row) => sum + row.availableCents, 0);
          const spent = group.rows.reduce((sum, row) => sum + row.spentCents, 0);
          const isClosed = closed[group.id] ?? false;
          return (
            <section key={group.id}>
              <button
                type="button"
                className="mb-2 flex w-full items-center justify-between gap-3 text-[13px] font-medium text-[var(--muted)]"
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
                    <CategoryRow
                      key={row.category.id}
                      row={row}
                      color={shelfColor(group.color)}
                      year={budget.year}
                      month={budget.month}
                      onOpen={() =>
                        setEditor({
                          kind: "row",
                          row,
                          planned: (row.plannedCents / 100).toFixed(0),
                          name: row.category.name,
                          rollover: row.category.rollover,
                        })
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}

        {flexRows.length > 0 ? (
          <section>
            <h2 className="ios-section">Safe to spend</h2>
            <button type="button" className="card w-full px-4 py-3.5 text-left" onClick={() => setEditor({ kind: "flex", amount: (flexPlan / 100).toFixed(0) })}>
              <span className="flex items-start justify-between gap-3">
                <span className="font-medium">Left</span>
                <MoneyText cents={flexPlan - flexSpent} signed />
              </span>
              <span className="my-2.5 block">
                <ProgressBar value={flexSpent} max={flexPlan || 1} />
              </span>
              <span className="block text-[13px] text-[var(--muted)]">
                <MoneyText cents={flexSpent} /> of <MoneyText cents={flexPlan} />
                {versusShort(flexSpent, flexUsual) ? ` · ${versusShort(flexSpent, flexUsual)}` : ""}
              </span>
            </button>
          </section>
        ) : null}

        {planOpen ? (
          <Sheet title="Edit plan" onClose={() => setPlanOpen(false)}>
            <div className="card">
              <button
                type="button"
                className="data-row w-full items-start text-left"
                onClick={() => {
                  setPlanOpen(false);
                  void suggest();
                }}
              >
                <span>
                  <span className="block font-medium">Use your usual spending</span>
                  <span className="mt-0.5 block text-[13px] font-normal text-[var(--muted)]">Fills each category from the last three months.</span>
                </span>
              </button>
              <button
                type="button"
                className="data-row w-full text-left font-medium"
                onClick={() => {
                  setPlanOpen(false);
                  setMoving(true);
                }}
              >
                Move money
              </button>
              <button
                type="button"
                className="data-row w-full text-left font-medium"
                onClick={() => {
                  setPlanOpen(false);
                  void openAdd();
                }}
              >
                Add category
              </button>
            </div>
          </Sheet>
        ) : null}

        {moving ? (
          <Sheet title="Move money" onClose={() => setMoving(false)}>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                const cents = dollarsToCents(moveForm.amount || 0);
                if (!moveForm.from || !moveForm.to || cents <= 0) return;
                void api("/api/budget", {
                  method: "PUT",
                  body: JSON.stringify({
                    year: budget.year,
                    month: budget.month,
                    move: { fromCategoryId: moveForm.from, toCategoryId: moveForm.to, cents },
                  }),
                }).then(() => {
                  setMoving(false);
                  invalidateQueries("budget:");
                  reload();
                });
              }}
            >
              <label className="field">
                <span className="field-label">From</span>
                <select className="shelf-input" value={moveForm.from} onChange={(event) => setMoveForm({ ...moveForm, from: event.target.value })} required>
                  <option value="">Choose</option>
                  {budget.rows.map((row) => (
                    <option key={row.category.id} value={row.category.id}>
                      {row.category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">To</span>
                <select className="shelf-input" value={moveForm.to} onChange={(event) => setMoveForm({ ...moveForm, to: event.target.value })} required>
                  <option value="">Choose</option>
                  {budget.rows.map((row) => (
                    <option key={row.category.id} value={row.category.id}>
                      {row.category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Amount</span>
                <input className="shelf-input" inputMode="decimal" value={moveForm.amount} onChange={(event) => setMoveForm({ ...moveForm, amount: event.target.value })} required />
              </label>
              <button className="shelf-btn w-full">Move</button>
            </form>
          </Sheet>
        ) : null}

        {editor?.kind === "row" ? (
          <Sheet title={editor.name || "Category"} onClose={() => setEditor(null)}>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                const row = editor.row;
                const planned = dollarsToCents(editor.planned || 0);
                const jobs: Promise<unknown>[] = [];
                if (planned !== row.plannedCents) {
                  jobs.push(
                    api("/api/budget", {
                      method: "PUT",
                      body: JSON.stringify({ year: budget.year, month: budget.month, items: [{ categoryId: row.category.id, plannedCents: planned }] }),
                    }),
                  );
                }
                if (editor.name.trim() && editor.name.trim() !== row.category.name) {
                  jobs.push(api("/api/categories", { method: "PATCH", body: JSON.stringify({ id: row.category.id, name: editor.name.trim() }) }));
                }
                if (editor.rollover !== row.category.rollover) {
                  jobs.push(api("/api/categories", { method: "PATCH", body: JSON.stringify({ id: row.category.id, rollover: editor.rollover }) }));
                }
                void Promise.all(jobs).then(() => {
                  setEditor(null);
                  invalidateQueries("budget:");
                  reload();
                });
              }}
            >
              <p className="text-[13px] text-[var(--muted)]">{versusShort(editor.row.spentCents, editor.row.usualCents ?? null)}</p>
              <label className="field">
                <span className="field-label">Name</span>
                <input className="shelf-input" value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} />
              </label>
              <label className="field">
                <span className="field-label">Planned</span>
                <input className="shelf-input" inputMode="decimal" value={editor.planned} onChange={(event) => setEditor({ ...editor, planned: event.target.value })} />
              </label>
              <button type="button" className="data-row w-full justify-between" aria-pressed={editor.rollover} onClick={() => setEditor({ ...editor, rollover: !editor.rollover })}>
                Rollover
                <span className={`switch ${editor.rollover ? "on" : ""}`} />
              </button>
              <button className="shelf-btn w-full">Save</button>
              <div className="flex flex-wrap gap-x-4">
                <Link href={activityHref({ categoryId: editor.row.category.id, start: range.start, end: range.end })} className="text-btn">
                  Activity
                </Link>
                <button
                  className="text-btn"
                  type="button"
                  onClick={() => {
                    void api("/api/categories", { method: "PATCH", body: JSON.stringify({ id: editor.row.category.id, flexBucket: "flex" }) }).then(() => {
                      setEditor(null);
                      invalidateQueries("budget:");
                      reload();
                    });
                  }}
                >
                  Count this in safe to spend
                </button>
                <button
                  className="text-btn"
                  type="button"
                  onClick={() => {
                    void api("/api/categories", { method: "DELETE", body: JSON.stringify({ id: editor.row.category.id, entity: "category" }) }).then(() => {
                      setEditor(null);
                      invalidateQueries("budget:");
                      reload();
                    });
                  }}
                >
                  Delete
                </button>
              </div>
            </form>
          </Sheet>
        ) : null}

        {editor?.kind === "flex" ? (
          <Sheet title="Safe to spend" onClose={() => setEditor(null)}>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void saveFlexTotal(dollarsToCents(editor.amount || 0)).then(() => setEditor(null));
              }}
            >
              <label className="field">
                <span className="field-label">Amount</span>
                <input className="shelf-input" inputMode="decimal" value={editor.amount} onChange={(event) => setEditor({ ...editor, amount: event.target.value })} />
              </label>
              <ul className="card">
                {flexRows.map((row) => (
                  <li key={row.category.id} className="data-row justify-between gap-3">
                    <Link href={activityHref({ categoryId: row.category.id, start: range.start, end: range.end })}>{row.category.name}</Link>
                    <button
                      className="text-btn"
                      type="button"
                      onClick={() => {
                        void api("/api/categories", { method: "PATCH", body: JSON.stringify({ id: row.category.id, flexBucket: "fixed" }) }).then(() => {
                          invalidateQueries("budget:");
                          reload();
                        });
                      }}
                    >
                      Budget on its own
                    </button>
                  </li>
                ))}
              </ul>
              <button className="shelf-btn w-full">Save</button>
            </form>
          </Sheet>
        ) : null}

        {editor?.kind === "add" ? (
          <Sheet title="New category" onClose={() => setEditor(null)}>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void api("/api/categories", {
                  method: "POST",
                  body: JSON.stringify({ groupId: editor.groupId, name: editor.name, flexBucket: "fixed" }),
                }).then(() => {
                  setEditor(null);
                  invalidateQueries("budget:");
                  reload();
                });
              }}
            >
              <label className="field">
                <span className="field-label">Group</span>
                <select className="shelf-input" value={editor.groupId} onChange={(event) => setEditor({ ...editor, groupId: event.target.value })}>
                  {groupsList.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Name</span>
                <input className="shelf-input" value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} required />
              </label>
              <button className="shelf-btn w-full">Add</button>
            </form>
          </Sheet>
        ) : null}

        {closeMonth ? (
          <Sheet title={`${monthName(budget.year, budget.month).split(" ")[0]} is ready`} onClose={dismissClose}>
            <p className="text-[15px]">
              {monthName(closeMonth.year, closeMonth.month)} left <MoneyText cents={Math.max(0, closeMonth.expensePlannedCents - closeMonth.expenseSpentCents)} />.
            </p>
            {rolled.length ? (
              <ul className="card">
                {rolled.map((row) => (
                  <li key={row.category.id} className="data-row justify-between">
                    <span>{row.category.name}</span>
                    <span className="text-[var(--muted)]">
                      kept <MoneyText cents={row.remainingCents} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[15px] text-[var(--muted)]">Nothing rolled over.</p>
            )}
            <button className="shelf-btn w-full" type="button" onClick={dismissClose}>
              Done
            </button>
          </Sheet>
        ) : null}
      </div>
    </PageShell>
  );
}

function BudgetSummary({
  budget,
  income,
  setIncome,
  saveIncome,
}: {
  budget: Budget;
  income: string;
  setIncome: (value: string) => void;
  saveIncome: () => void;
}) {
  const range = monthRange(budget.year, budget.month);
  const series = budget.spendSeries ?? [];
  const points = series.length
    ? seriesFromZero(series, range.start)
    : budget.expensePlannedCents > 0
      ? [
          { date: range.start, cents: 0 },
          { date: range.end, cents: 0 },
        ]
      : [];
  const pace = budget.expensePlannedCents > 0 ? budgetPace(budget.expenseSpentCents, budget.expensePlannedCents, budget.year, budget.month) : null;
  const paceTone: SummaryTone | null = !pace
    ? null
    : pace.tone === "over"
      ? "bad"
      : pace.tone === "hot"
        ? "warn"
        : pace.tone === "muted"
          ? "neutral"
          : "good";
  const status =
    pace?.label && paceTone
      ? { label: pace.label, tone: paceTone }
      : versusStatus(budget.usualSpentCents == null ? null : budget.expenseSpentCents - budget.usualSpentCents);

  return (
    <SummaryCard
      label="Spent"
      cents={budget.expenseSpentCents}
      status={status}
      points={points}
      reference={budget.expensePlannedCents > 0 ? { cents: budget.expensePlannedCents, label: "Plan" } : undefined}
      chartLabel="Spending through the month against the plan"
      footer={
        <span className="flex w-full items-center justify-between gap-4">
          <label className="min-w-0">
            <span className="summary-kicker">Planned income</span>
            <input
              className="shelf-input compact summary-income"
              inputMode="decimal"
              aria-label="Planned income"
              value={income}
              onChange={(event) => setIncome(event.target.value)}
              onBlur={saveIncome}
            />
          </label>
          <span className="text-right">
            <span className="summary-kicker">Left to budget</span>
            <span className="mt-1 block text-[17px] font-semibold tabular-nums">
              <MoneyText cents={budget.leftoverCents} signed />
            </span>
          </span>
        </span>
      }
      detail={
        budget.pendingCents ? (
          <>
            Pending <MoneyText cents={budget.pendingCents} /> is not included.
          </>
        ) : null
      }
    />
  );
}

function CategoryRow({
  row,
  color,
  year,
  month,
  onOpen,
}: {
  row: Row;
  color: string;
  year: number;
  month: number;
  onOpen: () => void;
}) {
  const pace = budgetPace(row.spentCents, row.availableCents, year, month);
  const usual = versusShort(row.spentCents, row.usualCents ?? null);
  return (
    <button type="button" className="block w-full border-b border-[var(--line)] px-4 py-3.5 text-left last:border-0" onClick={onOpen}>
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 font-medium">{row.category.name}</span>
        <MoneyText className="shrink-0" cents={row.remainingCents} signed />
      </span>
      <span className="my-2.5 block">
        <ProgressBar value={row.spentCents} max={row.availableCents || 1} color={color} />
      </span>
      <span className="flex flex-wrap gap-x-3 text-[13px] text-[var(--muted)]">
        {row.rolloverInCents > 0 ? (
          <span>
            +<MoneyText cents={row.rolloverInCents} /> carried in
          </span>
        ) : null}
        {pace.label ? <span className={pace.tone === "over" || pace.tone === "hot" ? "text-[var(--danger)]" : ""}>{pace.label}</span> : null}
        {usual ? <span>{usual}</span> : null}
      </span>
    </button>
  );
}
