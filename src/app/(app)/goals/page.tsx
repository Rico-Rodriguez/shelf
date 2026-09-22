"use client";

import { FormEvent, useEffect, useState } from "react";
import { MoneyText } from "@/components/MoneyText";
import { Sheet } from "@/components/Sheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageError, PageSkeleton } from "@/components/ui/PageShell";
import { SummaryCard, type SummaryTone } from "@/components/ui/SummaryCard";
import { CategorySelect, type CatGroup } from "@/components/CategoryPicker";
import { api } from "@/lib/client";
import { goalPace } from "@/lib/goal-pace";
import { useQuery } from "@/lib/use-query";

type Goal = {
  id: string;
  name: string;
  kind: "save_up" | "pay_down";
  targetCents: number;
  targetDate: string | null;
  progressCents: number;
  remainingCents: number;
  accounts: { id: string; name: string }[];
  monthlyCents?: number | null;
  categoryId?: string | null;
};

type Account = { id: string; name: string };

type GoalForm = { name: string; kind: "save_up" | "pay_down"; target: string; targetDate: string; accountIds: string[]; categoryId: string };

const empty: GoalForm = { name: "", kind: "save_up", target: "", targetDate: "", accountIds: [], categoryId: "" };

export default function GoalsPage() {
  const { data, loading, error, reload } = useQuery<{ goals: Goal[]; accounts: Account[] }>("goals", "/api/goals");
  const [groups, setGroups] = useState<CatGroup[]>([]);
  const [editing, setEditing] = useState<Goal | "new" | null>(null);
  const [form, setForm] = useState(empty);
  const goals = data?.goals ?? [];
  const accounts = data?.accounts ?? [];

  useEffect(() => {
    void api<{ groups: CatGroup[] }>("/api/categories").then((r) => setGroups(r.groups)).catch(() => undefined);
  }, []);

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
      categoryId: goal.categoryId ?? "",
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
      categoryId: form.categoryId || null,
    };
    if (editing === "new") {
      await api("/api/goals", { method: "POST", body: JSON.stringify(body) });
    } else if (editing) {
      await api("/api/goals", { method: "PATCH", body: JSON.stringify({ id: editing.id, ...body }) });
    }
    setEditing(null);
    reload();
  }

  async function remove(goal: Goal) {
    await api("/api/goals", { method: "DELETE", body: JSON.stringify({ id: goal.id }) });
    setEditing(null);
    reload();
  }

  if (!data && loading) return <PageSkeleton title="Goals" rows={3} />;
  if (!data) return <PageError title="Goals" message={error} onRetry={() => void reload()} />;

  return (
    <div className="space-y-4">
      <PageHeader title="Goals" subtitle="Save toward something, or pay a balance down.">
        <button className="shelf-btn" type="button" onClick={openNew}>
          Add
        </button>
      </PageHeader>

      {goals.length === 0 ? (
        <EmptyState title="One goal is enough" action={<button className="shelf-btn" type="button" onClick={openNew}>Add a goal</button>}>
          Save toward something, or pay a balance down. Link the account that holds the money.
        </EmptyState>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {goals.map((goal) => {
          const pace = goalPace(goal);
          const tone: SummaryTone = pace.tone === "behind" ? "bad" : pace.tone === "muted" ? "neutral" : "good";
          return (
            <SummaryCard
              key={goal.id}
              compact
              label={goal.name}
              labelEmphasis
              cents={goal.remainingCents}
              suffix="left"
              status={pace.label ? { label: pace.label, tone } : null}
              meter={{
                value: goal.progressCents,
                max: goal.kind === "pay_down" ? goal.progressCents + goal.remainingCents || 1 : goal.targetCents || 1,
                color: goal.kind === "save_up" ? "var(--positive)" : "var(--danger)",
              }}
              footer={
                <span className="flex w-full items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate">
                    {goal.targetDate ? `By ${goal.targetDate}` : goal.kind === "save_up" ? "Save up" : "Pay down"}
                    {goal.accounts.length ? ` · ${goal.accounts.map((account) => account.name).join(", ")}` : ""}
                  </span>
                  {goal.monthlyCents ? (
                    <span className="shrink-0">
                      <MoneyText cents={goal.monthlyCents} />
                      /mo
                    </span>
                  ) : null}
                </span>
              }
              onClick={() => openEdit(goal)}
            />
          );
        })}
      </div>

      {editing ? (
        <Sheet title={editing === "new" ? "New goal" : "Edit goal"} onClose={() => setEditing(null)}>
          <form className="space-y-3" onSubmit={save}>
            <input className="shelf-input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <select className="shelf-input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as "save_up" | "pay_down" })} aria-label="Kind">
              <option value="save_up">Save up</option>
              <option value="pay_down">Pay down</option>
            </select>
            <input className="shelf-input" inputMode="decimal" placeholder="Target" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
            <input className="shelf-input" type="date" aria-label="Target date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} />
            <label className="field">
              <span className="field-label">Budget category</span>
              <CategorySelect groups={groups} value={form.categoryId} onChange={(id) => setForm({ ...form, categoryId: id })} emptyLabel="No category" />
            </label>
            <div>
              <div className="mb-1 text-[13px] text-[var(--muted)]">Linked accounts</div>
              <div className="card">
                {accounts.map((account) => {
                  const on = form.accountIds.includes(account.id);
                  return (
                    <button key={account.id} type="button" className="data-row w-full justify-between text-[17px]" aria-pressed={on} onClick={() => toggleAccount(account.id)}>
                      {account.name}
                      <span className={`switch ${on ? "on" : ""}`} />
                    </button>
                  );
                })}
                {accounts.length === 0 ? <div className="data-row text-[var(--muted)]">Add an account first.</div> : null}
              </div>
            </div>
            <button className="shelf-btn w-full">Save</button>
          </form>
          {editing !== "new" ? (
            <button className="shelf-btn danger w-full" type="button" onClick={() => remove(editing)}>
              Delete
            </button>
          ) : null}
        </Sheet>
      ) : null}
    </div>
  );
}
