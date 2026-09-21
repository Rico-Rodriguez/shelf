"use client";

import { useCallback, useEffect, useState } from "react";
import { MoneyText } from "@/components/MoneyText";
import { ProgressBar } from "@/components/ProgressBar";
import { api } from "@/lib/client";
import { addMonths, monthName } from "@/lib/dates";
import { shelfColor } from "@/lib/palette";

type Row = {
  category: { id: string; name: string; flexBucket: string | null; rollover: boolean };
  group: { name: string; color: string } | null;
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

  if (!data) return <p className="pixel-title text-ink-soft">Lining up the jars…</p>;

  async function saveIncome() {
    await api("/api/budget", {
      method: "PUT",
      body: JSON.stringify({ year: data!.year, month: data!.month, plannedIncomeCents: Math.round(Number(income) * 100) }),
    });
    load(data!.year, data!.month);
  }

  async function setMode(mode: "category" | "flex") {
    await api("/api/budget", { method: "PUT", body: JSON.stringify({ year: data!.year, month: data!.month, mode }) });
    load(data!.year, data!.month);
  }

  async function setPlanned(categoryId: string, plannedCents: number) {
    await api("/api/budget", {
      method: "PUT",
      body: JSON.stringify({ year: data!.year, month: data!.month, items: [{ categoryId, plannedCents }] }),
    });
    load(data!.year, data!.month);
  }

  async function suggest() {
    await api("/api/budget", { method: "POST", body: JSON.stringify({ year: data!.year, month: data!.month, apply: true }) });
    load(data!.year, data!.month);
  }

  const prev = addMonths(data.year, data.month, -1);
  const next = addMonths(data.year, data.month, 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="pixel-title text-3xl">Budget</h1>
          <p className="text-sm text-ink-soft">Income in, shelves labeled, leftovers in the leftover jar.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="ios-icon-btn size-11 text-[22px] text-[var(--terracotta)]" type="button" onClick={() => load(prev.year, prev.month)} aria-label="Previous month">‹</button>
          <span className="min-w-36 text-center text-[17px] font-semibold tracking-[-0.41px]">{monthName(data.year, data.month)}</span>
          <button className="ios-icon-btn size-11 text-[22px] text-[var(--terracotta)]" type="button" onClick={() => load(next.year, next.month)} aria-label="Next month">›</button>
        </div>
      </div>

      <div className="ios-seg">
        <button type="button" className={data.mode === "category" ? "active" : ""} onClick={() => setMode("category")}>
          Category
        </button>
        <button type="button" className={data.mode === "flex" ? "active" : ""} onClick={() => setMode("flex")}>
          Flex
        </button>
      </div>

      <div className="pixel-panel flex flex-wrap items-end gap-3 p-4">
        <label className="text-sm">
          Planned income
          <input className="pixel-input mt-1" inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)} />
        </label>
        <button className="pixel-btn" type="button" onClick={saveIncome}>Save</button>
        <button className="pixel-btn ghost" type="button" onClick={suggest}>
          Suggest
        </button>
        <div className="ml-auto text-sm">
          Actual in <MoneyText cents={data.actualIncomeCents} /> · Leftover planned <MoneyText cents={data.leftoverCents} signed />
        </div>
      </div>

      {data.mode === "flex" ? (
        <div className="grid gap-4 md:grid-cols-3">
          {(["fixed", "non_monthly", "flex"] as const).map((bucket) => {
            const rows = data.flex[bucket];
            const planned = rows.reduce((s, r) => s + r.availableCents, 0);
            const spent = rows.reduce((s, r) => s + r.spentCents, 0);
            return (
              <section key={bucket} className="pixel-panel p-4">
                <h2 className="pixel-title capitalize">{bucket.replace("_", " ")}</h2>
                <ProgressBar value={spent} max={planned || 1} />
                <p className="my-2 text-sm">
                  <MoneyText cents={spent} /> / <MoneyText cents={planned} />
                </p>
                {bucket === "flex" ? (
                  <p className="text-xs text-ink-soft">One number for all the wobbly shelves.</p>
                ) : (
                  rows.map((r) => <RowLine key={r.category.id} row={r} onSave={setPlanned} />)
                )}
                {bucket === "flex" ? (
                  <RowLine
                    row={{
                      ...rows[0],
                      category: { id: "flex-total", name: "Flex pot", flexBucket: "flex", rollover: false },
                      plannedCents: planned,
                      availableCents: planned,
                      spentCents: spent,
                      remainingCents: planned - spent,
                      rolloverInCents: 0,
                      group: null,
                    }}
                    onSave={async (_id, cents) => {
                      if (!rows.length) return;
                      const each = Math.round(cents / rows.length);
                      for (const r of rows) await setPlanned(r.category.id, each);
                    }}
                  />
                ) : null}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="pixel-panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-cream-dark text-left">
              <tr>
                <th className="p-2">Shelf</th>
                <th className="p-2">Planned</th>
                <th className="p-2">Spent</th>
                <th className="p-2">Left</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.category.id} className="border-t border-ink/10">
                  <td className="p-2">
                    {r.category.name}
                    {r.category.rollover ? <span className="ml-1 text-xs text-ink-soft">rollover</span> : null}
                  </td>
                  <td className="p-2">
                    <input
                      className="pixel-input w-24"
                      defaultValue={(r.plannedCents / 100).toFixed(0)}
                      onBlur={(e) => setPlanned(r.category.id, Math.round(Number(e.target.value || 0) * 100))}
                    />
                  </td>
                  <td className="p-2">
                    <ProgressBar value={r.spentCents} max={r.availableCents || 1} color={shelfColor(r.group?.color)} />
                    <MoneyText cents={r.spentCents} />
                  </td>
                  <td className="p-2">
                    <MoneyText cents={r.remainingCents} signed />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RowLine({ row, onSave }: { row: Row; onSave: (id: string, cents: number) => void }) {
  if (!row) return null;
  return (
    <div className="mb-2">
      <div className="flex justify-between text-sm">
        <span>{row.category.name}</span>
        <MoneyText cents={row.spentCents} />
      </div>
      <ProgressBar value={row.spentCents} max={row.availableCents || 1} />
      <input
        className="pixel-input mt-1 w-24"
        defaultValue={(row.plannedCents / 100).toFixed(0)}
        onBlur={(e) => onSave(row.category.id, Math.round(Number(e.target.value || 0) * 100))}
      />
    </div>
  );
}
