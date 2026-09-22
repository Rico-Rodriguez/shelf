"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CategorySelect, type CatGroup } from "@/components/CategoryPicker";
import { MoneyText } from "@/components/MoneyText";
import { MonthNav } from "@/components/MonthNav";
import { Sheet } from "@/components/Sheet";
import { PageHeader } from "@/components/ui/PageHeader";
import { Segment } from "@/components/ui/Segment";
import { api } from "@/lib/client";
import { monthName, occurrencesInMonth, yearMonth } from "@/lib/dates";

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

const emptyForm = { merchantName: "", amount: "", cadence: "monthly", nextDate: "", isIncome: false, categoryId: "", accountId: "" };

export default function RecurringPage() {
  const now = yearMonth();
  const [cursor, setCursor] = useState(now);
  const [rows, setRows] = useState<Rec[]>([]);
  const [view, setView] = useState<"list" | "calendar">("calendar");
  const [suggestions, setSuggestions] = useState<Draft[]>([]);
  const [editing, setEditing] = useState<Rec | "new" | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [groups, setGroups] = useState<CatGroup[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);

  const load = useCallback(() => {
    void api<{ recurrences: Rec[] }>("/api/recurring").then((r) => setRows(r.recurrences));
  }, []);

  useEffect(() => {
    load();
    void api<{ groups: CatGroup[] }>("/api/categories").then((r) => setGroups(r.groups));
    void api<{ accounts: { id: string; name: string }[] }>("/api/accounts").then((r) => setAccounts(r.accounts));
  }, [load]);

  const active = rows.filter((row) => row.isActive);
  const projected = useMemo(() => {
    return active.flatMap((row) =>
      occurrencesInMonth(row.nextDate, row.cadence, cursor.year, cursor.month).map((date) => ({ ...row, date })),
    );
  }, [active, cursor]);

  const outflow = projected.filter((row) => !row.isIncome).reduce((sum, row) => sum + row.amountCents, 0);
  const income = projected.filter((row) => row.isIncome).reduce((sum, row) => sum + row.amountCents, 0);

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
    load();
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
    });
    setEditing(row);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (editing === "new") {
      await api("/api/recurring", {
        method: "POST",
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
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
        }),
      });
    }
    setEditing(null);
    load();
  }

  async function pause(row: Rec) {
    await api("/api/recurring", { method: "PATCH", body: JSON.stringify({ id: row.id, isActive: !row.isActive }) });
    load();
  }

  async function remove(row: Rec) {
    await api("/api/recurring", { method: "DELETE", body: JSON.stringify({ id: row.id }) });
    setEditing(null);
    load();
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bills & recurring"
        subtitle={
          <>
            Subscriptions and bills Shelf spotted for you. {monthName(cursor.year, cursor.month)} · Out <MoneyText cents={outflow} /> · In{" "}
            <MoneyText cents={income} />
          </>
        }
      >
        <div className="flex flex-wrap gap-2">
          <button className="shelf-btn secondary" type="button" onClick={detect}>
            Detect
          </button>
          <button className="shelf-btn" type="button" onClick={openNew}>
            Add
          </button>
        </div>
      </PageHeader>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav year={cursor.year} month={cursor.month} onChange={(year, month) => setCursor({ year, month })} />
        <Segment
          className="w-full max-w-xs"
          value={view}
          onChange={(value) => setView(value as "calendar" | "list")}
          options={[
            { value: "calendar", label: "Calendar" },
            { value: "list", label: "List" },
          ]}
        />
      </div>

      {suggestions.length ? (
        <section className="shelf-panel space-y-3 p-4">
          <h2 className="text-[17px] font-semibold">Detected</h2>
          <p className="text-[15px] text-[var(--muted)]">These are not on the calendar until you keep them.</p>
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
                  <MoneyText cents={draft.isIncome ? -draft.amountCents : draft.amountCents} signed />
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
          {rows.map((row) => (
            <li key={row.id}>
              <button type="button" className="data-row w-full justify-between gap-3 text-left" onClick={() => openEdit(row)}>
                <div className="min-w-0">
                  <div className={`truncate font-medium ${row.isActive ? "" : "text-[var(--muted)]"}`}>{row.merchantName}</div>
                  <div className="text-[13px] text-[var(--muted)]">
                    {row.cadence} · next {row.nextDate}
                    {row.isActive ? "" : " · paused"}
                  </div>
                </div>
                <MoneyText cents={row.isIncome ? -row.amountCents : row.amountCents} signed />
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
            <button type="button" className="data-row w-full justify-between rounded-[16px] text-[17px]" aria-pressed={form.isIncome} onClick={() => setForm({ ...form, isIncome: !form.isIncome })}>
              Income
              <span className={`switch ${form.isIncome ? "on" : ""}`} />
            </button>
            <button className="shelf-btn w-full">Save</button>
          </form>
          {editing !== "new" ? (
            <div className="flex gap-2">
              <button className="shelf-btn ghost flex-1" type="button" onClick={() => api("/api/recurring", { method: "POST", body: JSON.stringify({ action: "paid", id: editing.id }) }).then(() => { setEditing(null); load(); })}>
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
