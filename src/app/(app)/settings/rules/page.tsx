"use client";

import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CategorySelect, type CatGroup } from "@/components/CategoryPicker";
import { Icon } from "@/components/Icon";
import { Sheet } from "@/components/Sheet";
import { api } from "@/lib/client";

type Rule = {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  matchMerchant: string | null;
  matchDescription: string | null;
  actionRename: string | null;
  actionCategoryId: string | null;
  actionHide: boolean | null;
  actionTagNames: string | null;
};

const empty = {
  name: "",
  matchMerchant: "",
  actionRename: "",
  actionCategoryId: "",
  actionHide: false,
  actionTagNames: "",
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
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

  const load = useCallback(() => {
    void api<{ rules: Rule[] }>("/api/rules").then((r) => setRules(r.rules));
  }, []);

  useEffect(() => {
    load();
    void api<{ groups: CatGroup[] }>("/api/categories").then((r) => setGroups(r.groups));
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
        actionRename: form.actionRename || null,
        actionCategoryId: form.actionCategoryId || null,
        actionHide: form.actionHide,
        actionTagNames: form.actionTagNames || null,
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
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1>Rules</h1>
          <p>Most rules start from a transaction. You can also write one here.</p>
        </div>
        <button className="pixel-btn" type="button" onClick={() => { setForm(empty); setOpen(true); }}>
          Add
        </button>
      </div>

      {rules.length === 0 ? <p className="text-[15px] text-[var(--muted)]">No rules yet.</p> : null}

      <ul className="ios-group">
        {rules.map((rule) => (
          <li key={rule.id} className="ios-row items-start justify-between gap-3">
            <div className="min-w-0 py-1">
              <div className={`font-semibold ${rule.enabled ? "" : "text-[var(--muted)]"}`}>{rule.name}</div>
              <div className="text-[13px] text-[var(--muted)]">{describe(rule)}</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" className={`switch ${rule.enabled ? "on" : ""}`} aria-label={`${rule.enabled ? "Disable" : "Enable"} ${rule.name}`} onClick={() => toggle(rule)} />
              <button className="text-[15px] font-semibold text-[var(--danger)]" type="button" onClick={() => api(`/api/rules/${rule.id}`, { method: "DELETE" }).then(load)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      {open ? (
        <Sheet title="New rule" onClose={() => setOpen(false)}>
          <form className="space-y-3" onSubmit={add}>
            <input className="pixel-input" placeholder="Rule name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <input className="pixel-input" placeholder="Merchant contains" value={form.matchMerchant} onChange={(e) => setForm({ ...form, matchMerchant: e.target.value })} />
            <input className="pixel-input" placeholder="Rename to" value={form.actionRename} onChange={(e) => setForm({ ...form, actionRename: e.target.value })} />
            <CategorySelect groups={groups} value={form.actionCategoryId} onChange={(id) => setForm({ ...form, actionCategoryId: id })} emptyLabel="Keep category" />
            <input className="pixel-input" placeholder="Tags" value={form.actionTagNames} onChange={(e) => setForm({ ...form, actionTagNames: e.target.value })} />
            <button type="button" className="ios-row w-full justify-between rounded-[16px] text-[17px]" aria-pressed={form.actionHide} onClick={() => setForm({ ...form, actionHide: !form.actionHide })}>
              Hide
              <span className={`switch ${form.actionHide ? "on" : ""}`} />
            </button>
            <button type="button" className="ios-row w-full justify-between rounded-[16px] text-[17px]" aria-pressed={form.applyExisting} onClick={() => setForm({ ...form, applyExisting: !form.applyExisting })}>
              Apply to existing transactions
              <span className={`switch ${form.applyExisting ? "on" : ""}`} />
            </button>
            <button className="pixel-btn w-full">Save rule</button>
          </form>
        </Sheet>
      ) : null}
    </div>
  );
}
