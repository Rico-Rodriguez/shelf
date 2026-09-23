"use client";

import { FormEvent, useEffect, useState } from "react";
import { MoneyText } from "@/components/MoneyText";
import { Sheet } from "@/components/Sheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageError, PageShell, PageSkeleton } from "@/components/ui/PageShell";
import { Segment } from "@/components/ui/Segment";
import { useConfirmFlash } from "@/components/ConfirmFlash";
import { SummaryCard, type SummaryTone } from "@/components/ui/SummaryCard";
import { CategoryPicker, type CatGroup } from "@/components/CategoryPicker";
import { api } from "@/lib/client";
import { mediumDate } from "@/lib/dates";
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
  const { data, loading, refreshing, error, reload } = useQuery<{ goals: Goal[]; accounts: Account[] }>("goals", "/api/goals");
  const [groups, setGroups] = useState<CatGroup[]>([]);
  const [editing, setEditing] = useState<Goal | "new" | null>(null);
  const [form, setForm] = useState(empty);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { flash, run } = useConfirmFlash();
  const goals = data?.goals ?? [];
  const accounts = data?.accounts ?? [];

  useEffect(() => {
    void api<{ groups: CatGroup[] }>("/api/categories").then((r) => setGroups(r.groups)).catch(() => undefined);
  }, []);

  function openNew() {
    setConfirmDelete(false);
    setForm(empty);
    setEditing("new");
  }

  function openEdit(goal: Goal) {
    setConfirmDelete(false);
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
    await run(async () => {
      if (editing === "new") {
        await api("/api/goals", { method: "POST", body: JSON.stringify(body) });
      } else if (editing) {
        await api("/api/goals", { method: "PATCH", body: JSON.stringify({ id: editing.id, ...body }) });
      }
    });
    setEditing(null);
    reload();
  }

  async function remove(goal: Goal) {
    await run(async () => {
      await api("/api/goals", { method: "DELETE", body: JSON.stringify({ id: goal.id }) });
    });
    setEditing(null);
    reload();
  }

  if (!data && loading) return <PageSkeleton title="Goals" rows={3} />;
  if (!data) return <PageError title="Goals" message={error} onRetry={() => void reload()} />;

  return (
    <PageShell refreshing={refreshing}>
    <div className="screen">
      {flash}
      <PageHeader title="Goals">
        <button className="shelf-btn" type="button" onClick={openNew}>
          Add
        </button>
      </PageHeader>

      {goals.length === 0 ? (
        <EmptyState title="No goals yet" action={<button className="shelf-btn" type="button" onClick={openNew}>Add a goal</button>} />
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {goals.map((goal) => {
          const pace = goalPace(goal);
          const tone: SummaryTone = pace.tone === "behind" ? "bad" : pace.tone === "muted" ? "neutral" : "good";
          const done = goal.remainingCents <= 0 && goal.targetCents > 0;
          return (
            <SummaryCard
              key={goal.id}
              compact
              label={goal.name}
              labelEmphasis
              cents={done ? goal.targetCents : goal.remainingCents}
              suffix={done ? (goal.kind === "pay_down" ? "paid" : "saved") : "left"}
              status={pace.label ? { label: pace.label, tone } : null}
              meter={{
                value: goal.progressCents,
                max: goal.kind === "pay_down" ? goal.progressCents + goal.remainingCents || 1 : goal.targetCents || 1,
                color: goal.kind === "save_up" ? "var(--positive)" : "var(--danger)",
                overIsBad: goal.kind !== "save_up",
              }}
              footer={
                goal.targetDate || goal.accounts.length || goal.monthlyCents ? (
                  <span className="flex w-full items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate">
                      {goal.targetDate ? `By ${mediumDate(goal.targetDate)}` : goal.accounts.map((account) => account.name).join(", ")}
                      {goal.targetDate && goal.accounts.length ? ` · ${goal.accounts.map((account) => account.name).join(", ")}` : ""}
                    </span>
                    {goal.monthlyCents ? (
                      <span className="shrink-0">
                        <MoneyText cents={goal.monthlyCents} />
                        /mo
                      </span>
                    ) : null}
                  </span>
                ) : null
              }
              onClick={() => openEdit(goal)}
            />
          );
        })}
      </div>

      {editing ? (
        <Sheet title={editing === "new" ? "New goal" : "Edit goal"} onClose={() => setEditing(null)}>
          <form className="space-y-3" onSubmit={save}>
            <Segment
              value={form.kind}
              options={[
                { value: "save_up", label: "Save up" },
                { value: "pay_down", label: "Pay down" },
              ]}
              onChange={(kind) => setForm({ ...form, kind: kind as "save_up" | "pay_down" })}
            />
            <Field label="Target">
              <input className="shelf-input" inputMode="decimal" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
            </Field>
            <Field label="Name">
              <input className="shelf-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="Target date">
              <input className="shelf-input" type="date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} />
            </Field>
            <div>
              <div className="field-label">Linked accounts</div>
              <p className="field-hint mb-2">Progress comes from these balances.</p>
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
            <div>
              <div className="field-label">Category</div>
              <p className="field-hint mb-2">Optional.</p>
              <CategoryPicker groups={groups} value={form.categoryId} onChange={(id) => setForm({ ...form, categoryId: id })} />
            </div>
            <button className="shelf-btn w-full">Save</button>
          </form>
          {editing !== "new" ? (
            <button
              className="text-btn"
              type="button"
              onClick={() => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return;
                }
                void remove(editing);
              }}
            >
              {confirmDelete ? "Delete this goal?" : "Delete"}
            </button>
          ) : null}
        </Sheet>
      ) : null}
    </div>
    </PageShell>
  );
}
