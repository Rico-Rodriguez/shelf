"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { MoneyText } from "@/components/MoneyText";
import { ProgressBar } from "@/components/ProgressBar";
import { api } from "@/lib/client";

type Goal = {
  id: string;
  name: string;
  kind: "save_up" | "pay_down";
  targetCents: number;
  targetDate: string | null;
  progressCents: number;
  remainingCents: number;
  accounts: { id: string; name: string }[];
};

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({ name: "", kind: "save_up", target: "", accountIds: [] as string[] });

  const load = useCallback(() => {
    void api<{ goals: Goal[]; accounts: { id: string; name: string }[] }>("/api/goals").then((r) => {
      setGoals(r.goals);
      setAccounts(r.accounts);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    await api("/api/goals", {
      method: "POST",
      body: JSON.stringify({
        name: form.name,
        kind: form.kind,
        target: Number(form.target || 0),
        accountIds: form.accountIds,
      }),
    });
    setForm({ name: "", kind: "save_up", target: "", accountIds: [] });
    load();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="pixel-title text-3xl">Goals</h1>
        <p className="text-sm text-ink-soft">A labeled box for a future: cabin week, or a card to empty.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {goals.map((g) => (
          <section key={g.id} className="pixel-panel p-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="pixel-title text-xl">{g.name}</h2>
                <p className="text-xs text-ink-soft">{g.kind === "save_up" ? "Save up" : "Pay down"} · {g.accounts.map((a) => a.name).join(", ") || "no jar yet"}</p>
              </div>
              <button className="pixel-btn danger text-xs" type="button" onClick={() => api("/api/goals", { method: "DELETE", body: JSON.stringify({ id: g.id }) }).then(load)}>
                Remove
              </button>
            </div>
            <ProgressBar value={g.progressCents} max={g.targetCents || 1} color={g.kind === "save_up" ? "#6b8f5e" : "#d4847c"} />
            <p className="mt-2 text-sm">
              <MoneyText cents={g.progressCents} /> of <MoneyText cents={g.targetCents} />
              {g.targetDate ? ` · by ${g.targetDate}` : ""}
            </p>
          </section>
        ))}
      </div>
      <form onSubmit={add} className="pixel-panel grid gap-2 p-4 md:grid-cols-2">
        <h2 className="pixel-title md:col-span-2">New box</h2>
        <input className="pixel-input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <select className="pixel-input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
          <option value="save_up">Save up</option>
          <option value="pay_down">Pay down</option>
        </select>
        <input className="pixel-input" placeholder="Target $" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
        <select
          className="pixel-input"
          multiple
          value={form.accountIds}
          onChange={(e) => setForm({ ...form, accountIds: Array.from(e.target.selectedOptions).map((o) => o.value) })}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <button className="pixel-btn md:col-span-2">Set the box on the shelf</button>
      </form>
    </div>
  );
}
