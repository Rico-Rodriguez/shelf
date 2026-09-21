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
  actionRename: string | null;
  actionCategoryId: string | null;
  actionHide: boolean | null;
  actionTagNames: string | null;
  actionGoalId: string | null;
};

const empty = {
  name: "",
  matchMerchant: "",
  matchDescription: "",
  matchAmountMin: "",
  matchAmountMax: "",
  matchAccountId: "",
  actionRename: "",
  actionCategoryId: "",
  actionHide: false,
  actionTagNames: "",
  actionGoalId: "",
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
  const [groups, setGroups] = useState<CatGroup[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [goals, setGoals] = useState<{ id: string; name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

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
    setForm({
      ...empty,
      name: params.get("name") || merchant || "New rule",
      matchMerchant: merchant || "",
      actionRename: params.get("rename") || "",
      actionCategoryId: categoryId || "",
    });
    setOpen(true);
  }, [params]);

  async function add(e: FormEvent) {
    e.preventDefault();
    const created = await api<{ id: string }>("/api/rules", {
      method: "POST",
      body: JSON.stringify({
        name: form.name,
        matchMerchant: form.matchMerchant || null,
        matchDescription: form.matchDescription || null,
        matchAmountMin: form.matchAmountMin ? Math.round(Number(form.matchAmountMin) * 100) : null,
        matchAmountMax: form.matchAmountMax ? Math.round(Number(form.matchAmountMax) * 100) : null,
        matchAccountId: form.matchAccountId || null,
        actionRename: form.actionRename || null,
        actionCategoryId: form.actionCategoryId || null,
        actionHide: form.actionHide,
        actionTagNames: form.actionTagNames || null,
        actionGoalId: form.actionGoalId || null,
      }),
    });
    if (form.applyExisting) {
      await api(`/api/rules/${created.id}`, { method: "PATCH", body: JSON.stringify({ applyExisting: true }) });
    }
    setForm(empty);
    setOpen(false);
    load();
  }

  async function toggle(rule: Rule) {
    await api(`/api/rules/${rule.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !rule.enabled }) });
    load();
  }

  function describe(rule: Rule) {
    const parts = [];
    if (rule.matchMerchant) parts.push(`merchant contains “${rule.matchMerchant}”`);
    if (rule.matchDescription) parts.push(`description contains “${rule.matchDescription}”`);
    if (rule.matchAmountMin != null || rule.matchAmountMax != null) parts.push("amount range");
    const actions = [];
    if (rule.actionRename) actions.push(`rename to ${rule.actionRename}`);
    if (rule.actionCategoryId) actions.push("set category");
    if (rule.actionHide) actions.push("hide");
    if (rule.actionTagNames) actions.push(`tag ${rule.actionTagNames}`);
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
      <PageHeader title="Rules" subtitle="When a merchant matches, Shelf can rename, categorize, tag, or hide it automatically.">
        <button className="pixel-btn" type="button" onClick={() => { setForm(empty); setOpen(true); }}>
          Add
        </button>
      </PageHeader>

      {rules.length === 0 ? <EmptyState>No rules yet.</EmptyState> : null}

      <ul className="card">
        {rules.map((rule) => (
          <li key={rule.id} className="data-row items-start justify-between gap-3">
            <div className="min-w-0 py-1">
              <div className={`font-semibold ${rule.enabled ? "" : "text-[var(--muted)]"}`}>{rule.name}</div>
              <div className="text-[13px] text-[var(--muted)]">{describe(rule)}</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" className={`switch ${rule.enabled ? "on" : ""}`} aria-label={`${rule.enabled ? "Disable" : "Enable"} ${rule.name}`} onClick={() => toggle(rule)} />
              <button className="text-[13px] font-medium" type="button" onClick={() => api(`/api/rules/${rule.id}`, { method: "PATCH", body: JSON.stringify({ priority: rule.priority - 1 }) }).then(load)}>
                Up
              </button>
              <button className="text-[15px] font-semibold text-[var(--danger)]" type="button" onClick={() => api(`/api/rules/${rule.id}`, { method: "DELETE" }).then(load)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      {open ? (
        <Sheet title="New rule" onClose={() => setOpen(false)}>
          <form
            onSubmit={add}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="field-stack">
              <label className="field">
                <span className="field-label">Rule name</span>
                <input className="pixel-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </label>
              <label className="field">
                <span className="field-label">Merchant contains</span>
                <input className="pixel-input" placeholder="e.g. Starbucks" value={form.matchMerchant} onChange={(e) => setForm({ ...form, matchMerchant: e.target.value })} />
              </label>
              <label className="field">
                <span className="field-label">Description contains</span>
                <input className="pixel-input" value={form.matchDescription} onChange={(e) => setForm({ ...form, matchDescription: e.target.value })} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="field">
                  <span className="field-label">Min amount</span>
                  <input className="pixel-input" inputMode="decimal" value={form.matchAmountMin} onChange={(e) => setForm({ ...form, matchAmountMin: e.target.value })} />
                </label>
                <label className="field">
                  <span className="field-label">Max amount</span>
                  <input className="pixel-input" inputMode="decimal" value={form.matchAmountMax} onChange={(e) => setForm({ ...form, matchAmountMax: e.target.value })} />
                </label>
              </div>
              <label className="field">
                <span className="field-label">Account</span>
                <select className="pixel-input" value={form.matchAccountId} onChange={(e) => setForm({ ...form, matchAccountId: e.target.value })}>
                  <option value="">Any account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Rename to</span>
                <input className="pixel-input" value={form.actionRename} onChange={(e) => setForm({ ...form, actionRename: e.target.value })} />
              </label>
              <label className="field">
                <span className="field-label">Set category</span>
                <CategorySelect groups={groups} value={form.actionCategoryId} onChange={(id) => setForm({ ...form, actionCategoryId: id })} emptyLabel="Keep category" />
              </label>
              <label className="field">
                <span className="field-label">Tags</span>
                <input className="pixel-input" placeholder="Comma-separated" value={form.actionTagNames} onChange={(e) => setForm({ ...form, actionTagNames: e.target.value })} />
              </label>
              <label className="field">
                <span className="field-label">Link goal</span>
                <select className="pixel-input" value={form.actionGoalId} onChange={(e) => setForm({ ...form, actionGoalId: e.target.value })}>
                  <option value="">No goal</option>
                  {goals.map((goal) => (
                    <option key={goal.id} value={goal.id}>
                      {goal.name}
                    </option>
                  ))}
                </select>
              </label>
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
              <button className="pixel-btn w-full">Save rule</button>
            </div>
          </form>
        </Sheet>
      ) : null}
    </div>
  );
}
