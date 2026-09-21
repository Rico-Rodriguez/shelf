"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { MoneyText } from "@/components/MoneyText";
import { ProgressBar } from "@/components/ProgressBar";
import { Sheet } from "@/components/Sheet";
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

type Account = { id: string; name: string };

type GoalForm = { name: string; kind: "save_up" | "pay_down"; target: string; targetDate: string; accountIds: string[] };

const empty: GoalForm = { name: "", kind: "save_up", target: "", targetDate: "", accountIds: [] };

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [editing, setEditing] = useState<Goal | "new" | null>(null);
  const [form, setForm] = useState(empty);

  const load = useCallback(() => {
    void api<{ goals: Goal[]; accounts: Account[] }>("/api/goals").then((r) => {
      setGoals(r.goals);
      setAccounts(r.accounts);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openNew() {
    setForm(empty);
    setEditing("new");
  }

  function openEdit(goal: Goal) {
    setForm({
      name: goal.name,
      kind: goal.kind,
      target: (goal.targetCents / 100).toFixed(0),
      targetDate: goal.targetDate ?? "",
      accountIds: goal.accounts.map((account) => account.id),
    });
    setEditing(goal);
  }

  function toggleAccount(id: string) {
    setForm((current) => ({
      ...current,
      accountIds: current.accountIds.includes(id) ? current.accountIds.filter((item) => item !== id) : [...current.accountIds, id],
    }));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const body = {
      name: form.name,
      kind: form.kind,
      target: Number(form.target || 0),
      targetDate: form.targetDate || null,
      accountIds: form.accountIds,
    };
    if (editing === "new") {
      await api("/api/goals", { method: "POST", body: JSON.stringify(body) });
    } else if (editing) {
      await api("/api/goals", { method: "PATCH", body: JSON.stringify({ id: editing.id, ...body }) });
    }
    setEditing(null);
    load();
  }

  async function remove(goal: Goal) {
    await api("/api/goals", { method: "DELETE", body: JSON.stringify({ id: goal.id }) });
    setEditing(null);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1>Goals</h1>
          <p>A target for something ahead, or a balance you want gone.</p>
        </div>
        <button className="pixel-btn" type="button" onClick={openNew}>
          Add
        </button>
      </div>

      {goals.length === 0 ? <p className="text-[15px] text-[var(--muted)]">No goals yet.</p> : null}

      <div className="grid gap-3 md:grid-cols-2">
        {goals.map((goal) => (
          <button key={goal.id} type="button" className="pixel-panel p-4 text-left" onClick={() => openEdit(goal)}>
            <h2 className="text-[20px] font-bold tracking-tight">{goal.name}</h2>
            <p className="text-[13px] text-[var(--muted)]">
              {goal.kind === "save_up" ? "Save up" : "Pay down"}
              {goal.targetDate ? ` · by ${goal.targetDate}` : ""}
              {goal.accounts.length ? ` · ${goal.accounts.map((account) => account.name).join(", ")}` : ""}
            </p>
            <div className="my-3">
              <ProgressBar value={goal.progressCents} max={goal.targetCents || 1} color={goal.kind === "save_up" ? "#248a3d" : "#d4654a"} />
            </div>
            <p className="text-[15px]">
              <MoneyText cents={goal.progressCents} /> of <MoneyText cents={goal.targetCents} />
            </p>
          </button>
        ))}
      </div>

      {editing ? (
        <Sheet title={editing === "new" ? "New goal" : "Edit goal"} onClose={() => setEditing(null)}>
          <form className="space-y-3" onSubmit={save}>
            <input className="pixel-input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <select className="pixel-input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as "save_up" | "pay_down" })} aria-label="Kind">
              <option value="save_up">Save up</option>
              <option value="pay_down">Pay down</option>
            </select>
            <input className="pixel-input" inputMode="decimal" placeholder="Target" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
            <input className="pixel-input" type="date" aria-label="Target date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} />
            <div>
              <div className="mb-1 text-[13px] text-[var(--muted)]">Linked accounts</div>
              <div className="ios-group">
                {accounts.map((account) => {
                  const on = form.accountIds.includes(account.id);
                  return (
                    <button key={account.id} type="button" className="ios-row w-full justify-between text-[17px]" aria-pressed={on} onClick={() => toggleAccount(account.id)}>
                      {account.name}
                      <span className={`switch ${on ? "on" : ""}`} />
                    </button>
                  );
                })}
                {accounts.length === 0 ? <div className="ios-row text-[var(--muted)]">Add an account first.</div> : null}
              </div>
            </div>
            <button className="pixel-btn w-full">Save</button>
          </form>
          {editing !== "new" ? (
            <button className="pixel-btn danger w-full" type="button" onClick={() => remove(editing)}>
              Delete
            </button>
          ) : null}
        </Sheet>
      ) : null}
    </div>
  );
}
