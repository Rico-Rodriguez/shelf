"use client";

import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CategorySelect, type CatGroup } from "@/components/CategoryPicker";
import { Icon } from "@/components/Icon";
import { Sheet } from "@/components/Sheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/client";

type Rule = {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  matchMerchant: string | null;
  matchDescription: string | null;
  matchAmountMin: number | null;
  matchAmountMax: number | null;
  matchAccountId: string | null;
  matchCategoryId: string | null;
  actionRename: string | null;
  actionCategoryId: string | null;
  actionHide: boolean | null;
  actionTagNames: string | null;
  actionGoalId: string | null;
  actionSplitJson: string | null;
};

type FormState = {
  name: string;
  matchMerchant: string;
  matchDescription: string;
  matchAmountMin: string;
  matchAmountMax: string;
  matchAccountId: string;
  matchCategoryId: string;
  actionRename: string;
  actionCategoryId: string;
  actionHide: boolean;
  actionTagNames: string;
  actionGoalId: string;
  splitCategoryId: string;
  splitAmount: string;
  applyExisting: boolean;
};

const empty: FormState = {
  name: "",
  matchMerchant: "",
  matchDescription: "",
  matchAmountMin: "",
  matchAmountMax: "",
  matchAccountId: "",
  matchCategoryId: "",
  actionRename: "",
  actionCategoryId: "",
  actionHide: false,
  actionTagNames: "",
  actionGoalId: "",
  splitCategoryId: "",
  splitAmount: "",
  applyExisting: true,
};

export default function RulesPage() {
  return (
    <Suspense fallback={<p className="text-[var(--muted)]">Loading…</p>}>
      <Rules />
    </Suspense>
  );
}

function Rules() {
  const params = useSearchParams();
  const [rules, setRules] = useState<Rule[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [groups, setGroups] = useState<CatGroup[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [goals, setGoals] = useState<{ id: string; name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [preview, setPreview] = useState<string | null>(null);

  const load = useCallback(() => {
    void api<{ rules: Rule[] }>("/api/rules").then((r) => setRules(r.rules));
  }, []);

  useEffect(() => {
    load();
    void api<{ groups: CatGroup[] }>("/api/categories").then((r) => setGroups(r.groups));
    void api<{ accounts: { id: string; name: string }[] }>("/api/accounts").then((r) => setAccounts(r.accounts));
    void api<{ goals: { id: string; name: string }[] }>("/api/goals").then((r) => setGoals(r.goals));
  }, [load]);

  useEffect(() => {
    const merchant = params.get("merchant");
    const categoryId = params.get("categoryId");
    if (!merchant && !categoryId) return;
    setEditingId(null);
    setForm({
      ...empty,
      name: params.get("name") || merchant || "New rule",
      matchMerchant: merchant || "",
      actionRename: params.get("rename") || "",
      actionCategoryId: categoryId || "",
    });
    setOpen(true);
  }, [params]);

  function payload() {
    const split =
      form.splitCategoryId && form.splitAmount
        ? JSON.stringify([{ categoryId: form.splitCategoryId, amountCents: Math.round(Number(form.splitAmount) * 100) }])
        : null;
    return {
      name: form.name,
      matchMerchant: form.matchMerchant || null,
      matchDescription: form.matchDescription || null,
      matchAmountMin: form.matchAmountMin ? Math.round(Number(form.matchAmountMin) * 100) : null,
      matchAmountMax: form.matchAmountMax ? Math.round(Number(form.matchAmountMax) * 100) : null,
      matchAccountId: form.matchAccountId || null,
      matchCategoryId: form.matchCategoryId || null,
      actionRename: form.actionRename || null,
      actionCategoryId: form.actionCategoryId || null,
      actionHide: form.actionHide,
      actionTagNames: form.actionTagNames || null,
      actionGoalId: form.actionGoalId || null,
      actionSplitJson: split,
    };
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const body = payload();
    if (editingId) {
      const res = await api<{ applied?: number }>(`/api/rules/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify({ ...body, applyExisting: form.applyExisting }),
      });
      setPreview(form.applyExisting ? `Updated. Applied to ${res.applied ?? 0} transactions.` : "Updated.");
    } else {
      const created = await api<{ id: string }>("/api/rules", { method: "POST", body: JSON.stringify(body) });
      if (form.applyExisting) {
        const res = await api<{ applied?: number }>(`/api/rules/${created.id}`, { method: "PATCH", body: JSON.stringify({ applyExisting: true }) });
        setPreview(`Saved. Applied to ${res.applied ?? 0} existing transactions.`);
      }
    }
    setForm(empty);
    setEditingId(null);
    setOpen(false);
    load();
  }

  async function dryRun() {
    const body = payload();
    const res = await api<{ count: number }>("/api/rules/preview", { method: "POST", body: JSON.stringify(body) });
    setPreview(`Would match ${res.count} existing transaction${res.count === 1 ? "" : "s"}.`);
  }

  function openEdit(rule: Rule) {
    let splitCategoryId = "";
    let splitAmount = "";
    if (rule.actionSplitJson) {
      try {
        const parts = JSON.parse(rule.actionSplitJson) as { categoryId?: string; amountCents?: number }[];
        splitCategoryId = parts[0]?.categoryId ?? "";
        splitAmount = parts[0]?.amountCents != null ? (parts[0].amountCents / 100).toFixed(2) : "";
      } catch {
        splitCategoryId = "";
      }
    }
    setEditingId(rule.id);
    setPreview(null);
    setForm({
      name: rule.name,
      matchMerchant: rule.matchMerchant ?? "",
      matchDescription: rule.matchDescription ?? "",
      matchAmountMin: rule.matchAmountMin != null ? (rule.matchAmountMin / 100).toFixed(2) : "",
      matchAmountMax: rule.matchAmountMax != null ? (rule.matchAmountMax / 100).toFixed(2) : "",
      matchAccountId: rule.matchAccountId ?? "",
      matchCategoryId: rule.matchCategoryId ?? "",
      actionRename: rule.actionRename ?? "",
      actionCategoryId: rule.actionCategoryId ?? "",
      actionHide: Boolean(rule.actionHide),
      actionTagNames: rule.actionTagNames ?? "",
      actionGoalId: rule.actionGoalId ?? "",
      splitCategoryId,
      splitAmount,
      applyExisting: false,
    });
    setOpen(true);
  }

  async function move(index: number, dir: -1 | 1) {
    const nextIndex = index + dir;
    if (nextIndex < 0 || nextIndex >= rules.length) return;
    const next = rules.slice();
    const [row] = next.splice(index, 1);
    next.splice(nextIndex, 0, row);
    await Promise.all(next.map((rule, order) => api(`/api/rules/${rule.id}`, { method: "PATCH", body: JSON.stringify({ priority: order }) })));
    load();
  }

  function describe(rule: Rule) {
    const parts = [];
    if (rule.matchMerchant) parts.push(`merchant contains “${rule.matchMerchant}”`);
    if (rule.matchDescription) parts.push(`description contains “${rule.matchDescription}”`);
    if (rule.matchCategoryId) parts.push("category matches");
    if (rule.matchAmountMin != null || rule.matchAmountMax != null) parts.push("amount range");
    const actions = [];
    if (rule.actionRename) actions.push(`rename to ${rule.actionRename}`);
    if (rule.actionCategoryId) actions.push("set category");
    if (rule.actionHide) actions.push("hide");
    if (rule.actionTagNames) actions.push(`tag ${rule.actionTagNames}`);
    if (rule.actionGoalId) actions.push("link a goal");
    if (rule.actionSplitJson) actions.push("split");
    return `${parts.join(", ") || "Any transaction"}${actions.length ? ` → ${actions.join(", ")}` : ""}`;
  }

  return (
    <div className="space-y-4">
      <Link href="/settings" className="ios-back">
        <span className="inline-flex rotate-180" aria-hidden>
          <Icon name="chevron" size={18} />
        </span>
        Settings
      </Link>
      <PageHeader title="Rules" subtitle="Earlier rules win. Edit any rule, preview matches, then apply them to history.">
        <button className="shelf-btn" type="button" onClick={() => { setForm(empty); setEditingId(null); setPreview(null); setOpen(true); }}>
          Add
        </button>
      </PageHeader>

      {rules.length === 0 ? (
        <EmptyState title="No rules yet" action={<button className="shelf-btn" type="button" onClick={() => setOpen(true)}>Add a rule</button>}>
          A rule renames, categorizes, tags, hides, or links a goal the moment a merchant shows up.
        </EmptyState>
      ) : null}

      <ul className="card">
        {rules.map((rule, index) => (
          <li
            key={rule.id}
            className="data-row items-start justify-between gap-3"
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (dragIndex == null || dragIndex === index) return;
              const next = rules.slice();
              const [row] = next.splice(dragIndex, 1);
              next.splice(index, 0, row);
              setDragIndex(null);
              void Promise.all(next.map((item, order) => api(`/api/rules/${item.id}`, { method: "PATCH", body: JSON.stringify({ priority: order }) }))).then(load);
            }}
          >
            <button type="button" className="min-w-0 flex-1 py-1 text-left" onClick={() => openEdit(rule)}>
              <div className={`font-semibold ${rule.enabled ? "" : "text-[var(--muted)]"}`}>{rule.name}</div>
              <div className="text-[13px] text-[var(--muted)]">{describe(rule)}</div>
            </button>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" className={`switch ${rule.enabled ? "on" : ""}`} aria-label={`${rule.enabled ? "Disable" : "Enable"} ${rule.name}`} onClick={() => api(`/api/rules/${rule.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !rule.enabled }) }).then(load)} />
              <button className="text-[13px] font-medium" type="button" disabled={index === 0} onClick={() => move(index, -1)}>
                Earlier
              </button>
              <button className="text-[13px] font-medium" type="button" disabled={index === rules.length - 1} onClick={() => move(index, 1)}>
                Later
              </button>
              <button className="text-[15px] font-semibold text-[var(--danger)]" type="button" onClick={() => api(`/api/rules/${rule.id}`, { method: "DELETE" }).then(load)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      {open ? (
        <Sheet title={editingId ? "Edit rule" : "New rule"} onClose={() => setOpen(false)}>
          <form onSubmit={save} onClick={(e) => e.stopPropagation()}>
            <div className="field-stack">
              <label className="field">
                <span className="field-label">Rule name</span>
                <input className="shelf-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </label>
              <label className="field">
                <span className="field-label">Merchant contains</span>
                <input className="shelf-input" placeholder="e.g. Starbucks" value={form.matchMerchant} onChange={(e) => setForm({ ...form, matchMerchant: e.target.value })} />
              </label>
              <label className="field">
                <span className="field-label">Description contains</span>
                <input className="shelf-input" value={form.matchDescription} onChange={(e) => setForm({ ...form, matchDescription: e.target.value })} />
              </label>
              <label className="field">
                <span className="field-label">Current category</span>
                <CategorySelect groups={groups} value={form.matchCategoryId} onChange={(id) => setForm({ ...form, matchCategoryId: id })} emptyLabel="Any category" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="field">
                  <span className="field-label">Min amount</span>
                  <input className="shelf-input" inputMode="decimal" value={form.matchAmountMin} onChange={(e) => setForm({ ...form, matchAmountMin: e.target.value })} />
                </label>
                <label className="field">
                  <span className="field-label">Max amount</span>
                  <input className="shelf-input" inputMode="decimal" value={form.matchAmountMax} onChange={(e) => setForm({ ...form, matchAmountMax: e.target.value })} />
                </label>
              </div>
              <label className="field">
                <span className="field-label">Account</span>
                <select className="shelf-input" value={form.matchAccountId} onChange={(e) => setForm({ ...form, matchAccountId: e.target.value })}>
                  <option value="">Any account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Rename to</span>
                <input className="shelf-input" value={form.actionRename} onChange={(e) => setForm({ ...form, actionRename: e.target.value })} />
              </label>
              <label className="field">
                <span className="field-label">Set category</span>
                <CategorySelect groups={groups} value={form.actionCategoryId} onChange={(id) => setForm({ ...form, actionCategoryId: id })} emptyLabel="Keep category" />
              </label>
              <label className="field">
                <span className="field-label">Tags</span>
                <input className="shelf-input" placeholder="Comma-separated" value={form.actionTagNames} onChange={(e) => setForm({ ...form, actionTagNames: e.target.value })} />
              </label>
              <label className="field">
                <span className="field-label">Link goal</span>
                <select className="shelf-input" value={form.actionGoalId} onChange={(e) => setForm({ ...form, actionGoalId: e.target.value })}>
                  <option value="">No goal</option>
                  {goals.map((goal) => (
                    <option key={goal.id} value={goal.id}>{goal.name}</option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="field">
                  <span className="field-label">Split into</span>
                  <CategorySelect groups={groups} value={form.splitCategoryId} onChange={(id) => setForm({ ...form, splitCategoryId: id })} emptyLabel="No split" />
                </label>
                <label className="field">
                  <span className="field-label">Split amount</span>
                  <input className="shelf-input" inputMode="decimal" value={form.splitAmount} onChange={(e) => setForm({ ...form, splitAmount: e.target.value })} />
                </label>
              </div>
              <div className="card">
                <button type="button" className="data-row w-full justify-between" aria-pressed={form.actionHide} onClick={() => setForm({ ...form, actionHide: !form.actionHide })}>
                  Hide matching purchases
                  <span className={`switch ${form.actionHide ? "on" : ""}`} />
                </button>
                <button type="button" className="data-row w-full justify-between" aria-pressed={form.applyExisting} onClick={() => setForm({ ...form, applyExisting: !form.applyExisting })}>
                  Apply to existing transactions
                  <span className={`switch ${form.applyExisting ? "on" : ""}`} />
                </button>
              </div>
              {preview ? <p className="story-line">{preview}</p> : null}
              <button className="shelf-btn secondary w-full" type="button" onClick={dryRun}>Preview matches</button>
              <button className="shelf-btn w-full">Save rule</button>
            </div>
          </form>
        </Sheet>
      ) : null}
    </div>
  );
}
