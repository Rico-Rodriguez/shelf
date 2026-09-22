"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useConfirmFlash } from "@/components/ConfirmFlash";
import { MoneyText } from "@/components/MoneyText";
import { MonthNav } from "@/components/MonthNav";
import { ProgressBar } from "@/components/ProgressBar";
import { Sheet } from "@/components/Sheet";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageError, PageShell, PageSkeleton } from "@/components/ui/PageShell";
import { SummaryCard, type SummaryTone } from "@/components/ui/SummaryCard";
import { api } from "@/lib/client";
import { activityHref } from "@/lib/activity";
import { addMonths, inDaysPhrase, monthName, monthRange, todayISO } from "@/lib/dates";
import { dollarsToCents } from "@/lib/money";
import { budgetPace } from "@/lib/plan";
import { shelfColor } from "@/lib/palette";
import { versusStatus } from "@/lib/voice";
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
  const [showUnused, setShowUnused] = useState(false);
  const [groupsList, setGroupsList] = useState<{ id: string; name: string }[]>([]);
  const [closeMonth, setCloseMonth] = useState<Budget | null>(null);
  const { flash, run } = useConfirmFlash();
  const qs = cursor.year && cursor.month ? `?year=${cursor.year}&month=${cursor.month}` : "";
  const { data, loading, refreshing, error, reload } = useQuery<Budget>(`budget:${qs || "current"}`, `/api/budget${qs}`, { keepPrevious: true });
  const { data: bills } = useQuery<{ recurrences: { id: string; merchantName: string; amountCents: number; nextDate: string; isIncome: boolean; isActive: boolean }[] }>(
    "bills",
    "/api/recurring",
  );

  useEffect(() => {
    if (data) setIncome((data.plannedIncomeCents / 100).toFixed(0));
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

  if (!data && loading) return <PageSkeleton variant="plan" />;
  if (!data) return <PageError title="Budget" message={error} onRetry={() => void reload()} />;

  const budget = data;
  const quietRow = (row: Row) => row.spentCents <= 0 && row.availableCents <= 0 && row.rolloverInCents <= 0;
  const hiddenCount = groups.reduce((sum, group) => sum + group.rows.filter(quietRow).length, 0);
  const visibleGroups = showUnused
    ? groups
    : groups
        .map((group) => ({ ...group, rows: group.rows.filter((row) => !quietRow(row)) }))
        .filter((group) => group.rows.length > 0);
  const flexPlan = budget.flexPoolCents > 0 ? budget.flexPoolCents : flexRows.reduce((sum, row) => sum + row.availableCents, 0);
  const flexSpent = flexRows.reduce((sum, row) => sum + row.spentCents, 0);
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
  }

  async function commit(work: (() => Promise<void>) | null, close: () => void) {
    if (work) await run(work);
    close();
    invalidateQueries("budget:");
    reload();
  }

  function dismissClose() {
    setCloseMonth(null);
  }

  async function openLastMonth() {
    setPlanOpen(false);
    const prev = addMonths(budget.year, budget.month, -1);
    const previous = await api<Budget>(`/api/budget?year=${prev.year}&month=${prev.month}`);
    if (previous.expensePlannedCents <= 0 && previous.expenseSpentCents <= 0) return;
    setCloseMonth(previous);
  }

  async function openAdd() {
    const res = await api<{ groups: { id: string; name: string }[] }>("/api/categories");
    setGroupsList(res.groups);
    setEditor({ kind: "add", groupId: res.groups[0]?.id ?? "", name: "" });
  }

  const rolled = closeMonth?.rows.filter((row) => row.category.rollover && row.remainingCents > 0) ?? [];

  return (
    <PageShell refreshing={refreshing}>
      <div className="space-y-4">
        {flash}
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

        <BudgetSummary budget={budget} />

        {budget.expensePlannedCents <= 0 ? (
          <button className="shelf-btn" type="button" onClick={() => void suggest()}>
            Use your usual spending
          </button>
        ) : null}

        {visibleGroups.map((group) => {
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
                  {planned > 0 ? (
                    <>
                      <MoneyText cents={spent} /> / <MoneyText cents={planned} />
                    </>
                  ) : (
                    <MoneyText cents={spent} />
                  )}
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

        {hiddenCount > 0 ? (
          <button type="button" className="text-btn" onClick={() => setShowUnused((value) => !value)}>
            {showUnused ? "Hide unused categories" : `Show ${hiddenCount} unused ${hiddenCount === 1 ? "category" : "categories"}`}
          </button>
        ) : null}

        {flexRows.length > 0 ? (
          <section>
            <h2 className="ios-section">Day to day</h2>
            <button type="button" className="card w-full px-4 py-3.5 text-left" onClick={() => setEditor({ kind: "flex", amount: (flexPlan / 100).toFixed(0) })}>
              <span className="flex items-start justify-between gap-3">
                <span className="font-medium">{flexPlan > 0 ? "Remaining" : "Spent"}</span>
                <MoneyText cents={flexPlan > 0 ? flexPlan - flexSpent : flexSpent} signed={flexPlan > 0} />
              </span>
              {flexPlan > 0 ? (
                <span className="mt-2.5 block">
                  <ProgressBar value={flexSpent} max={flexPlan} />
                </span>
              ) : null}
            </button>
          </section>
        ) : null}

        {(() => {
          const today = todayISO();
          const upcoming = (bills?.recurrences ?? []).filter((row) => row.isActive && !row.isIncome && row.nextDate >= today).slice(0, 5);
          if (!upcoming.length) return null;
          return (
            <section>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="ios-section mb-0">Bills</h2>
                <Link href="/recurring" className="text-btn">
                  See all
                </Link>
              </div>
              <div className="card">
                {upcoming.map((bill) => (
                  <Link key={bill.id} href="/recurring" className="data-row justify-between gap-3">
                    <span className="truncate">{bill.merchantName}</span>
                    <span className="shrink-0 text-[var(--muted)]">
                      {inDaysPhrase(bill.nextDate)} · <MoneyText cents={bill.amountCents} />
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })()}

        {planOpen ? (
          <Sheet title="Edit budget" onClose={() => setPlanOpen(false)}>
            <label className="field">
              <span className="field-label">Planned income</span>
              <input
                className="shelf-input"
                inputMode="decimal"
                aria-label="Planned income"
                value={income}
                onChange={(event) => setIncome(event.target.value)}
                onBlur={() => void saveIncome()}
              />
            </label>
            <div className="card">
              <button
                type="button"
                className="data-row w-full text-left"
                onClick={() => {
                  setPlanOpen(false);
                  void suggest();
                }}
              >
                <span className="font-medium">Use your usual spending</span>
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
              <button type="button" className="data-row w-full text-left font-medium" onClick={() => void openLastMonth()}>
                Last month
              </button>
              <Link href="/goals" className="data-row" onClick={() => setPlanOpen(false)}>
                Goals
              </Link>
              <Link href="/recurring" className="data-row" onClick={() => setPlanOpen(false)}>
                Bills
              </Link>
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
                void commit(
                  () =>
                    api("/api/budget", {
                      method: "PUT",
                      body: JSON.stringify({
                        year: budget.year,
                        month: budget.month,
                        move: { fromCategoryId: moveForm.from, toCategoryId: moveForm.to, cents },
                      }),
                    }).then(() => undefined),
                  () => setMoving(false),
                );
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
                void commit(jobs.length ? () => Promise.all(jobs).then(() => undefined) : null, () => setEditor(null));
              }}
            >
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
                void commit(() => saveFlexTotal(dollarsToCents(editor.amount || 0)), () => setEditor(null));
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
                void commit(
                  () =>
                    api("/api/categories", {
                      method: "POST",
                      body: JSON.stringify({ groupId: editor.groupId, name: editor.name, flexBucket: "fixed" }),
                    }).then(() => undefined),
                  () => setEditor(null),
                );
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

function leftSeries(points: { date: string; cents: number }[], leftCents: number, origin: string) {
  if (!points.length) return [];
  const last = points[points.length - 1].cents;
  const mapped = points.map((point) => ({ date: point.date, cents: leftCents + (last - point.cents) }));
  if (mapped[0].date !== origin) return [{ date: origin, cents: leftCents + last }, ...mapped];
  if (mapped.length === 1) return [{ date: origin, cents: leftCents + last }, mapped[0]];
  return mapped;
}

function BudgetSummary({ budget }: { budget: Budget }) {
  const range = monthRange(budget.year, budget.month);
  const left = budget.expensePlannedCents - budget.expenseSpentCents;
  const points = budget.expensePlannedCents > 0 ? leftSeries(budget.spendSeries ?? [], left, range.start) : [];
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

  const unplanned = budget.expensePlannedCents <= 0;

  return (
    <SummaryCard
      label={unplanned ? "Spent this month" : "Left to spend"}
      cents={unplanned ? budget.expenseSpentCents : left}
      signed={!unplanned && left < 0}
      status={unplanned ? { label: "No plan yet", tone: "neutral" } : status}
      points={points}
      chartLabel={unplanned ? "Spending this month" : "Left to spend through the month"}
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
  const paced = row.availableCents > 0;
  const pace = budgetPace(row.spentCents, row.availableCents, year, month);
  const paceNote = pace.tone === "over" ? "Over" : pace.tone === "hot" ? "Running hot" : "";
  return (
    <button type="button" className="budget-row" onClick={onOpen}>
      <span className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span className="spend-dot" style={{ background: color }} />
          <span className="min-w-0 truncate font-medium">{row.category.name}</span>
        </span>
        {paced ? (
          <MoneyText className="shrink-0" cents={row.remainingCents} signed />
        ) : (
          <MoneyText className="shrink-0" cents={row.spentCents} />
        )}
      </span>
      {paced ? (
        <span className="my-2.5 block">
          <ProgressBar value={row.spentCents} max={row.availableCents} color={color} />
        </span>
      ) : null}
      {row.rolloverInCents > 0 || paceNote ? (
        <span className={`flex flex-wrap gap-x-3 text-[13px] text-[var(--muted)] ${paced ? "" : "mt-1"}`}>
          {row.rolloverInCents > 0 ? (
            <span>
              +<MoneyText cents={row.rolloverInCents} /> carried in
            </span>
          ) : null}
          {paceNote ? <span className="text-[var(--danger)]">{paceNote}</span> : null}
        </span>
      ) : null}
    </button>
  );
}
