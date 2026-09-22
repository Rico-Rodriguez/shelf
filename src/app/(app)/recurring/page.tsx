"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CategorySelect, type CatGroup } from "@/components/CategoryPicker";
import { MerchantMark } from "@/components/MerchantMark";
import { MoneyText } from "@/components/MoneyText";
import { MonthNav } from "@/components/MonthNav";
import { Sheet } from "@/components/Sheet";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageError, PageSkeleton } from "@/components/ui/PageShell";
import { seriesFromZero, SummaryCard } from "@/components/ui/SummaryCard";
import { Segment } from "@/components/ui/Segment";
import { api } from "@/lib/client";
import { useQuery } from "@/lib/use-query";
import { inDaysPhrase, monthName, monthRange, occurrencesInMonth, todayISO, yearMonth } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { annualizedCents } from "@/lib/plan";

type Rec = {
  id: string;
  merchantName: string;
  amountCents: number;
  cadence: string;
  nextDate: string;
  isIncome: boolean;
  isActive: boolean;
  source: string;
  lastPaidDate: string | null;
  categoryId: string | null;
  accountId: string | null;
  kind?: "bill" | "subscription";
  priceDeltaCents?: number | null;
};

type Draft = {
  merchantName: string;
  amountCents: number;
  cadence: string;
  nextDate: string;
  categoryId: string | null;
  accountId: string | null;
  isIncome: boolean;
  lastPaidDate: string;
};

const CADENCES = [
  ["weekly", "Weekly"],
  ["biweekly", "Biweekly"],
  ["monthly", "Monthly"],
  ["quarterly", "Quarterly"],
  ["yearly", "Yearly"],
] as const;

const emptyForm = { merchantName: "", amount: "", cadence: "monthly", nextDate: "", isIncome: false, categoryId: "", accountId: "", kind: "bill" as "bill" | "subscription" };

export default function RecurringPage() {
  const now = yearMonth();
  const [cursor, setCursor] = useState(now);
  const { data, loading, error, reload } = useQuery<{ recurrences: Rec[] }>("bills", "/api/recurring");
  const rows = data?.recurrences ?? [];
  const [view, setView] = useState<"list" | "calendar">("list");
  const [bucket, setBucket] = useState<"all" | "bill" | "subscription">("all");
  const [suggestions, setSuggestions] = useState<Draft[]>([]);
  const [editing, setEditing] = useState<Rec | "new" | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [groups, setGroups] = useState<CatGroup[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    void api<{ groups: CatGroup[] }>("/api/categories").then((r) => setGroups(r.groups));
    void api<{ accounts: { id: string; name: string }[] }>("/api/accounts").then((r) => setAccounts(r.accounts));
  }, []);

  const active = rows.filter((row) => row.isActive && (bucket === "all" || (row.kind ?? "bill") === bucket));
  const listed = rows.filter((row) => bucket === "all" || (row.kind ?? "bill") === bucket);
  const projected = useMemo(() => {
    return active.flatMap((row) =>
      occurrencesInMonth(row.nextDate, row.cadence, cursor.year, cursor.month).map((date) => ({ ...row, date })),
    );
  }, [active, cursor]);

  const monthlyBills = rows
    .filter((row) => row.isActive && !row.isIncome)
    .reduce((sum, row) => sum + Math.round(annualizedCents(row.amountCents, row.cadence) / 12), 0);
  const outflow = projected.filter((row) => !row.isIncome).reduce((sum, row) => sum + row.amountCents, 0);

  if (!data && loading) return <PageSkeleton title="Bills" rows={5} />;
  if (!data) return <PageError title="Bills" message={error} onRetry={() => void reload()} />;

  const days = new Date(cursor.year, cursor.month, 0).getDate();
  const startPad = new Date(cursor.year, cursor.month - 1, 1).getDay();

  async function detect() {
    const res = await api<{ suggestions: Draft[] }>("/api/recurring", { method: "POST", body: JSON.stringify({ action: "detect" }) });
    setSuggestions(res.suggestions);
  }

  async function confirm(drafts: Draft[]) {
    if (!drafts.length) {
      setSuggestions([]);
      return;
    }
    await api("/api/recurring", { method: "POST", body: JSON.stringify({ action: "confirm", suggestions: drafts }) });
    setSuggestions([]);
    reload();
  }

  function openNew() {
    setForm(emptyForm);
    setEditing("new");
  }

  function openEdit(row: Rec) {
    setForm({
      merchantName: row.merchantName,
      amount: (row.amountCents / 100).toFixed(2),
      cadence: row.cadence,
      nextDate: row.nextDate,
      isIncome: row.isIncome,
      categoryId: row.categoryId ?? "",
      accountId: row.accountId ?? "",
      kind: row.kind ?? "bill",
    });
    setEditing(row);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (editing === "new") {
      await api("/api/recurring", {
        method: "POST",
        body: JSON.stringify({ ...form, amount: Number(form.amount), kind: form.kind }),
      });
    } else if (editing) {
      await api("/api/recurring", {
        method: "PATCH",
        body: JSON.stringify({
          id: editing.id,
          merchantName: form.merchantName,
          amount: Number(form.amount),
          cadence: form.cadence,
          nextDate: form.nextDate,
          isIncome: form.isIncome,
          categoryId: form.categoryId || null,
          accountId: form.accountId || null,
          kind: form.kind,
        }),
      });
    }
    setEditing(null);
    reload();
  }

  async function pause(row: Rec) {
    await api("/api/recurring", { method: "PATCH", body: JSON.stringify({ id: row.id, isActive: !row.isActive }) });
    reload();
  }

  async function remove(row: Rec) {
    await api("/api/recurring", { method: "DELETE", body: JSON.stringify({ id: row.id }) });
    setEditing(null);
    reload();
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Bills">
        <button className="text-btn" type="button" onClick={detect}>
          Find bills
        </button>
        <button className="shelf-btn" type="button" onClick={openNew}>
          Add
        </button>
      </PageHeader>
      <BillsSummary
        year={cursor.year}
        month={cursor.month}
        monthlyBills={monthlyBills}
        outflow={outflow}
        projected={projected}
      />

      <div className="flex items-center gap-3">
        <MonthNav year={cursor.year} month={cursor.month} onChange={(year, month) => setCursor({ year, month })} />
        <button className="text-btn ml-auto shrink-0" type="button" onClick={() => setView(view === "list" ? "calendar" : "list")}>
          {view === "list" ? "Calendar" : "List"}
        </button>
      </div>
      <Segment
        value={bucket}
        onChange={(value) => setBucket(value as "all" | "bill" | "subscription")}
        options={[
          { value: "all", label: "All" },
          { value: "bill", label: "Bills" },
          { value: "subscription", label: "Subscriptions" },
        ]}
      />

      {suggestions.length ? (
        <section className="shelf-panel space-y-3 p-4">
          <h2 className="text-[17px] font-semibold">Detected</h2>
          <ul className="card">
            {suggestions.map((draft) => (
              <li key={draft.merchantName} className="data-row justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate">{draft.merchantName}</div>
                  <div className="text-[13px] text-[var(--muted)]">
                    {draft.cadence} · next {draft.nextDate}
                  </div>
                </div>
                <span className="flex shrink-0 items-center gap-3">
                  <MoneyText cents={draft.isIncome ? -draft.amountCents : draft.amountCents} flow />
                  <button className="text-[15px] font-semibold text-[var(--ink)]" type="button" onClick={() => setSuggestions(suggestions.filter((row) => row.merchantName !== draft.merchantName))}>
                    Skip
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <button className="shelf-btn" type="button" onClick={() => confirm(suggestions)}>
            Keep these
          </button>
        </section>
      ) : null}

      {view === "calendar" ? (
        <div className="shelf-panel p-3">
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
              <div key={index} className="text-[11px] font-medium text-[var(--muted)]">
                {day}
              </div>
            ))}
            {Array.from({ length: startPad }).map((_, index) => (
              <div key={`pad-${index}`} />
            ))}
            {Array.from({ length: days }).map((_, index) => {
              const day = index + 1;
              const iso = `${cursor.year}-${String(cursor.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const hits = projected.filter((row) => row.date === iso);
              return (
                <div key={iso} className="min-h-16 rounded-[16px] bg-[rgba(120,120,128,0.08)] p-1 text-left">
                  <div className="text-[11px] text-[var(--muted)]">{day}</div>
                  {hits.map((hit) => (
                    <button key={hit.id + hit.date} type="button" className="block w-full truncate text-left text-[11px]" onClick={() => openEdit(hit)}>
                      {hit.merchantName}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <ul className="card">
          {listed.map((row) => (
            <li key={row.id}>
              <button type="button" className="data-row w-full justify-between gap-3 text-left" onClick={() => openEdit(row)}>
                <MerchantMark name={row.merchantName} />
                <div className="min-w-0 flex-1">
                  <div className={`truncate font-medium ${row.isActive ? "" : "text-[var(--muted)]"}`}>{row.merchantName}</div>
                  <div className="truncate text-[13px] text-[var(--muted)]">
                    {row.isActive ? `${row.isIncome ? "Payday" : "Due"} ${inDaysPhrase(row.nextDate)}` : "Paused"}
                    {row.priceDeltaCents ? ` · ${row.priceDeltaCents > 0 ? "Up" : "Down"}` : ""}
                  </div>
                </div>
                <MoneyText className="shrink-0" cents={row.isIncome ? -row.amountCents : row.amountCents} flow />
              </button>
            </li>
          ))}
          {rows.length === 0 ? <li className="data-row text-[var(--muted)]">No bills yet.</li> : null}
        </ul>
      )}

      {editing ? (
        <Sheet title={editing === "new" ? "New bill" : form.merchantName || "Bill"} onClose={() => setEditing(null)}>
          <form className="space-y-3" onSubmit={save}>
            <input className="shelf-input" placeholder="Name" value={form.merchantName} onChange={(e) => setForm({ ...form, merchantName: e.target.value })} required />
            <input className="shelf-input" inputMode="decimal" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            <select className="shelf-input" value={form.cadence} onChange={(e) => setForm({ ...form, cadence: e.target.value })} aria-label="Cadence">
              {CADENCES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input className="shelf-input" type="date" value={form.nextDate} onChange={(e) => setForm({ ...form, nextDate: e.target.value })} required aria-label="Next date" />
            <label className="field">
              <span className="field-label">Category</span>
              <CategorySelect groups={groups} value={form.categoryId} onChange={(id) => setForm({ ...form, categoryId: id })} emptyLabel="No category" />
            </label>
            <label className="field">
              <span className="field-label">Account</span>
              <select className="shelf-input" value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
                <option value="">Any account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
            </label>
            <button type="button" className="data-row w-full justify-between rounded-[16px] text-[17px]" aria-pressed={form.kind === "subscription"} onClick={() => setForm({ ...form, kind: form.kind === "subscription" ? "bill" : "subscription" })}>
              Subscription
              <span className={`switch ${form.kind === "subscription" ? "on" : ""}`} />
            </button>
            <button type="button" className="data-row w-full justify-between rounded-[16px] text-[17px]" aria-pressed={form.isIncome} onClick={() => setForm({ ...form, isIncome: !form.isIncome })}>
              Income
              <span className={`switch ${form.isIncome ? "on" : ""}`} />
            </button>
            <button className="shelf-btn w-full">Save</button>
          </form>
          {editing !== "new" ? (
            <div className="flex gap-2">
              <button className="shelf-btn ghost flex-1" type="button" onClick={() => api("/api/recurring", { method: "POST", body: JSON.stringify({ action: "paid", id: editing.id }) }).then(() => { setEditing(null); reload(); })}>
                Skip cycle
              </button>
              <button className="shelf-btn ghost flex-1" type="button" onClick={() => pause(editing)}>
                {editing.isActive ? "Pause" : "Resume"}
              </button>
              <button className="shelf-btn danger flex-1" type="button" onClick={() => remove(editing)}>
                Delete
              </button>
            </div>
          ) : null}
        </Sheet>
      ) : null}
    </div>
  );
}

function BillsSummary({
  year,
  month,
  monthlyBills,
  outflow,
  projected,
}: {
  year: number;
  month: number;
  monthlyBills: number;
  outflow: number;
  projected: { merchantName: string; amountCents: number; date: string; isIncome: boolean }[];
}) {
  const now = yearMonth();
  const range = monthRange(year, month);
  const today = todayISO();
  const byDate = new Map<string, number>();
  for (const row of projected) {
    if (row.isIncome) continue;
    byDate.set(row.date, (byDate.get(row.date) ?? 0) + row.amountCents);
  }
  let run = 0;
  const curve = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, cents]) => {
      run += cents;
      return { date, cents: run };
    });
  const points = curve.length
    ? seriesFromZero(curve, range.start)
    : monthlyBills > 0
      ? [
          { date: range.start, cents: 0 },
          { date: range.end, cents: 0 },
        ]
      : [];
  const delta = outflow - monthlyBills;
  const status =
    monthlyBills <= 0 || Math.abs(delta) < 100
      ? null
      : delta > 0
        ? { label: `${formatMoney(delta)} above typical`, tone: "warn" as const }
        : { label: `${formatMoney(-delta)} under typical`, tone: "good" as const };
  const next = [...projected].filter((row) => row.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];

  return (
    <SummaryCard
      label={year === now.year && month === now.month ? "Due this month" : monthName(year, month)}
      cents={outflow}
      status={status}
      points={points}
      reference={monthlyBills > 0 ? { cents: monthlyBills, label: "Typical" } : undefined}
      chartLabel="Bills landing through the month"
      footer={next ? `${next.isIncome ? "Payday" : next.merchantName} ${inDaysPhrase(next.date)}` : null}
      footerIcon={next ? "calendar" : undefined}
    />
  );
}
