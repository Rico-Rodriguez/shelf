"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { MoneyText } from "@/components/MoneyText";
import { api } from "@/lib/client";
import { yearMonth } from "@/lib/dates";

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
};

export default function RecurringPage() {
  const [rows, setRows] = useState<Rec[]>([]);
  const [view, setView] = useState<"list" | "calendar">("calendar");
  const [form, setForm] = useState({ merchantName: "", amount: "", cadence: "monthly", nextDate: "", isIncome: false });

  const load = useCallback(() => {
    void api<{ recurrences: Rec[] }>("/api/recurring").then((r) => setRows(r.recurrences));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function detect() {
    await api("/api/recurring", { method: "POST", body: JSON.stringify({ action: "detect" }) });
    load();
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    await api("/api/recurring", {
      method: "POST",
      body: JSON.stringify({ ...form, amount: Number(form.amount) }),
    });
    setForm({ merchantName: "", amount: "", cadence: "monthly", nextDate: "", isIncome: false });
    load();
  }

  const { year, month } = yearMonth();
  const days = new Date(year, month, 0).getDate();
  const cells = useMemo(() => {
    const startPad = new Date(year, month - 1, 1).getDay();
    return { startPad, days };
  }, [year, month, days]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="pixel-title text-3xl">Bills & rhythm</h1>
          <p className="text-sm text-ink-soft">Subscriptions, rent, paycheck — on a calendar like a wall planner.</p>
        </div>
        <div className="ios-seg w-full max-w-xs">
          <button className={view === "calendar" ? "active" : ""} type="button" onClick={() => setView("calendar")}>
            Calendar
          </button>
          <button className={view === "list" ? "active" : ""} type="button" onClick={() => setView("list")}>
            List
          </button>
        </div>
        <button className="pixel-btn secondary" type="button" onClick={detect}>
          Detect
        </button>
      </div>

      {view === "calendar" ? (
        <div className="pixel-panel p-3">
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} className="text-[11px] font-medium text-[var(--muted)]">{d}</div>
            ))}
            {Array.from({ length: cells.startPad }).map((_, i) => (
              <div key={`p${i}`} />
            ))}
            {Array.from({ length: cells.days }).map((_, i) => {
              const day = i + 1;
              const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const hits = rows.filter((r) => r.isActive && r.nextDate === iso);
              return (
                <div key={iso} className="min-h-16 rounded-[16px] bg-[rgba(120,120,128,0.08)] p-1 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                  <div className="text-[10px] text-ink-soft">{day}</div>
                  {hits.map((h) => (
                    <div key={h.id} className="truncate text-[10px]">
                      {h.merchantName}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="pixel-panel flex flex-wrap items-center justify-between gap-2 p-3">
              <div>
                <div className="font-semibold">{r.merchantName}</div>
                <div className="text-xs text-ink-soft">
                  {r.cadence} · next {r.nextDate} · {r.source}
                </div>
              </div>
              <MoneyText cents={r.isIncome ? -r.amountCents : r.amountCents} signed />
              <div className="flex gap-2">
                <button className="pixel-btn" type="button" onClick={() => api("/api/recurring", { method: "POST", body: JSON.stringify({ action: "paid", id: r.id }) }).then(load)}>
                  Paid
                </button>
                <button className="pixel-btn ghost" type="button" onClick={() => api("/api/recurring", { method: "PATCH", body: JSON.stringify({ id: r.id, isActive: !r.isActive }) }).then(load)}>
                  {r.isActive ? "Pause" : "Resume"}
                </button>
                <button className="pixel-btn danger" type="button" onClick={() => api("/api/recurring", { method: "DELETE", body: JSON.stringify({ id: r.id }) }).then(load)}>
                  Toss
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="pixel-panel grid gap-2 p-4 md:grid-cols-5">
        <h2 className="pixel-title md:col-span-5">Pin a new bill</h2>
        <input className="pixel-input" placeholder="Name" value={form.merchantName} onChange={(e) => setForm({ ...form, merchantName: e.target.value })} required />
        <input className="pixel-input" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
        <select className="pixel-input" value={form.cadence} onChange={(e) => setForm({ ...form, cadence: e.target.value })}>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Biweekly</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>
        <input className="pixel-input" type="date" value={form.nextDate} onChange={(e) => setForm({ ...form, nextDate: e.target.value })} required />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.isIncome} onChange={(e) => setForm({ ...form, isIncome: e.target.checked })} />
          Income
        </label>
        <button className="pixel-btn md:col-span-5">Add</button>
      </form>
    </div>
  );
}
