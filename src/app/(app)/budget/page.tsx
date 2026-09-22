"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CategoryPicker, type CatGroup } from "@/components/CategoryPicker";
import { useConfirmFlash } from "@/components/ConfirmFlash";
import { MoneyText } from "@/components/MoneyText";
import { MonthNav } from "@/components/MonthNav";
import { ProgressBar } from "@/components/ProgressBar";
import { Sheet } from "@/components/Sheet";
import { Field } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageError, PageShell, PageSkeleton } from "@/components/ui/PageShell";
import { SummaryCard, type SummaryTone } from "@/components/ui/SummaryCard";
import { api } from "@/lib/client";
import { addMonths, dayLabel, monthName, monthRange, shortDate } from "@/lib/dates";
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

type RowEditor = { kind: "row"; row: Row; planned: string; name: string; rollover: boolean };

type Editor = RowEditor | { kind: "add"; groupId: string; name: string } | null;

type MonthTx = {
  id: string;
  name: string;
  merchantName: string | null;
  amountCents: number;
  date: string;
  categoryId: string | null;
};

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
    await run(async () => {
      await api("/api/budget", { method: "POST", body: JSON.stringify({ year: budget.year, month: budget.month, apply: true }) });
    });
    invalidateQueries("budget:");
    reload();
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
      <div className="screen">
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
            Fill from a usual month
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
            {showUnused ? "Hide other categories" : `Show ${hiddenCount} other ${hiddenCount === 1 ? "category" : "categories"}`}
          </button>
        ) : null}

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
                <span className="min-w-0">
                  <span className="block font-medium">Fill from a usual month</span>
                  <span className="block text-[13px] font-normal text-[var(--muted)]">Replace each plan with what you typically spend.</span>
                </span>
              </button>
              <button
                type="button"
                className="data-row w-full text-left"
                onClick={() => {
                  setPlanOpen(false);
                  setMoving(true);
                }}
              >
                <span className="min-w-0">
                  <span className="block font-medium">Move money</span>
                  <span className="block text-[13px] font-normal text-[var(--muted)]">Take from one category and add it to another.</span>
                </span>
              </button>
              <button
                type="button"
                className="data-row w-full text-left"
                onClick={() => {
                  setPlanOpen(false);
                  void openAdd();
                }}
              >
                <span className="min-w-0">
                  <span className="block font-medium">Add a category</span>
                  <span className="block text-[13px] font-normal text-[var(--muted)]">Give a kind of spending its own plan.</span>
                </span>
              </button>
              <button type="button" className="data-row w-full text-left" onClick={() => void openLastMonth()}>
                <span className="min-w-0">
                  <span className="block font-medium">Last month</span>
                  <span className="block text-[13px] font-normal text-[var(--muted)]">See what was left over and carried in.</span>
                </span>
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
          <CategorySheet
            key={editor.row.category.id}
            editor={editor}
            year={budget.year}
            month={budget.month}
            start={range.start}
            end={range.end}
            onChange={setEditor}
            onClose={() => setEditor(null)}
            onCommit={commit}
            onMoved={() => {
              invalidateQueries("budget:");
              invalidateQueries("activity:");
              invalidateQueries("dashboard");
              reload();
            }}
          />
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
      label={unplanned ? "Spent this month" : "Left in the plan"}
      cents={unplanned ? budget.expenseSpentCents : left}
      signed={!unplanned && left < 0}
      status={unplanned ? { label: "No plan yet", tone: "neutral" } : status}
      points={points}
      chartLabel={unplanned ? "Spending this month" : "Left in the plan through the month"}
      note={
        unplanned
          ? `Charges from ${shortDate(monthRange(budget.year, budget.month).start)} through ${shortDate(monthRange(budget.year, budget.month).end)}.`
          : `Charges from ${shortDate(monthRange(budget.year, budget.month).start)} through ${shortDate(monthRange(budget.year, budget.month).end)}. A plan with no charges was carried from an earlier month.`
      }
    />
  );
}

function CategoryRow({
  row,
  color,
  onOpen,
}: {
  row: Row;
  color: string;
  onOpen: () => void;
}) {
  const paced = row.availableCents > 0;
  const over = paced && row.remainingCents < 0;
  const usual =
    row.usualCents != null && row.usualCents > 0 && Math.abs(row.availableCents - row.usualCents) / row.usualCents < 0.05;
  return (
    <button type="button" className="budget-row" onClick={onOpen}>
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            <span className="spend-dot" style={{ background: color }} />
            <span className="min-w-0 truncate font-medium">{row.category.name}</span>
          </span>
          {paced ? (
            <span className="mt-1 block pl-4 text-[13px] text-[var(--muted)]">
              {row.spentCents === 0 ? (
                usual ? (
                  "No charges this month. This is your usual month, kept as the plan."
                ) : (
                  "No charges this month. This plan was carried from an earlier month."
                )
              ) : over ? (
                <>
                  <MoneyText cents={Math.abs(row.remainingCents)} /> over a <MoneyText cents={row.availableCents} /> plan
                </>
              ) : (
                <>
                  <MoneyText cents={row.availableCents} /> plan
                </>
              )}
            </span>
          ) : (
            <span className="mt-1 block pl-4 text-[13px] text-[var(--muted)]">Charged this month</span>
          )}
        </span>
        <MoneyText className={`shrink-0 ${over ? "text-[var(--danger)]" : ""}`} cents={row.spentCents} />
      </span>
      {paced ? (
        <span className="my-2.5 block">
          <ProgressBar value={row.spentCents} max={row.availableCents} color={color} />
        </span>
      ) : null}
    </button>
  );
}

function CategorySheet({
  editor,
  year,
  month,
  start,
  end,
  onChange,
  onClose,
  onCommit,
  onMoved,
}: {
  editor: RowEditor;
  year: number;
  month: number;
  start: string;
  end: string;
  onChange: (next: RowEditor) => void;
  onClose: () => void;
  onCommit: (work: (() => Promise<void>) | null, close: () => void) => Promise<void>;
  onMoved: () => void;
}) {
  const [groups, setGroups] = useState<CatGroup[]>([]);
  const [txs, setTxs] = useState<MonthTx[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const categoryId = editor.row.category.id;

  useEffect(() => {
    let live = true;
    void api<{ groups: CatGroup[] }>("/api/categories").then((res) => {
      if (live) setGroups(res.groups);
    });
    void api<{ transactions: MonthTx[] }>(`/api/transactions?categoryId=${categoryId}&start=${start}&end=${end}`).then((res) => {
      if (live) setTxs(res.transactions);
    });
    return () => {
      live = false;
    };
  }, [categoryId, start, end]);

  async function reassign(tx: MonthTx, nextId: string) {
    const next = nextId || null;
    if (next === (tx.categoryId ?? null)) return;
    await api(`/api/transactions/${tx.id}`, {
      method: "PATCH",
      body: JSON.stringify({ categoryId: next, reviewed: true }),
    });
    setTxs((current) => (current ?? []).filter((row) => row.id !== tx.id));
    onMoved();
  }

  function save(event: FormEvent) {
    event.preventDefault();
    const row = editor.row;
    const planned = dollarsToCents(editor.planned || 0);
    const jobs: Promise<unknown>[] = [];
    if (planned !== row.plannedCents) {
      jobs.push(
        api("/api/budget", {
          method: "PUT",
          body: JSON.stringify({ year, month, items: [{ categoryId: row.category.id, plannedCents: planned }] }),
        }),
      );
    }
    if (editor.name.trim() && editor.name.trim() !== row.category.name) {
      jobs.push(api("/api/categories", { method: "PATCH", body: JSON.stringify({ id: row.category.id, name: editor.name.trim() }) }));
    }
    void onCommit(jobs.length ? () => Promise.all(jobs).then(() => undefined) : null, onClose);
  }

  return (
    <Sheet title={editor.name || "Category"} onClose={onClose}>
      <form className="space-y-4" onSubmit={save}>
        <Field label="Plan" hint={`Carried amount for ${shortDate(start)}–${shortDate(end)}. This is not a charge.`}>
          <input className="shelf-input" inputMode="decimal" value={editor.planned} onChange={(event) => onChange({ ...editor, planned: event.target.value })} />
        </Field>
        <div>
          <div className="field-label">Charges from {shortDate(start)} through {shortDate(end)}</div>
          {txs == null ? (
            <p className="mt-2 text-[15px] text-[var(--muted)]">Loading…</p>
          ) : txs.length === 0 ? (
            <p className="mt-2 text-[15px] leading-snug text-[var(--muted)]">
              Nothing posted in this category between those dates. The plan was carried from an earlier month. Lower it if you do not want it. If the payment is under another category, move it here.
            </p>
          ) : (
            <div className="card mt-2">
              {txs.map((tx) => (
                <div key={tx.id} className="data-row flex-col items-stretch gap-2">
                  <span className="flex w-full items-baseline justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{tx.merchantName || tx.name}</span>
                      <span className="text-[13px] text-[var(--muted)]">{dayLabel(tx.date)}</span>
                    </span>
                    <MoneyText className="shrink-0" cents={tx.amountCents} flow />
                  </span>
                  <CategoryPicker groups={groups} value={tx.categoryId ?? categoryId} onChange={(id) => void reassign(tx, id)} />
                </div>
              ))}
            </div>
          )}
        </div>
        <Field label="Name">
          <input className="shelf-input" value={editor.name} onChange={(event) => onChange({ ...editor, name: event.target.value })} />
        </Field>
        <button className="shelf-btn w-full">Save</button>
        <button
          className="text-btn"
          type="button"
          onClick={() => {
            if (!confirmDelete) {
              setConfirmDelete(true);
              return;
            }
            void onCommit(
              () => api("/api/categories", { method: "DELETE", body: JSON.stringify({ id: categoryId, entity: "category" }) }).then(() => undefined),
              onClose,
            );
          }}
        >
          {confirmDelete ? "Delete this category?" : "Delete"}
        </button>
      </form>
    </Sheet>
  );
}
