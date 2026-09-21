"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
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

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [cats, setCats] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    name: "",
    matchMerchant: "",
    actionRename: "",
    actionCategoryId: "",
    actionHide: false,
    actionTagNames: "",
    applyExisting: true,
  });

  const load = useCallback(() => {
    void api<{ rules: Rule[] }>("/api/rules").then((r) => setRules(r.rules));
  }, []);

  useEffect(() => {
    load();
    void api<{ groups: { categories: { id: string; name: string }[] }[] }>("/api/categories").then((r) =>
      setCats(r.groups.flatMap((g) => g.categories)),
    );
  }, [load]);

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
    setForm({ name: "", matchMerchant: "", actionRename: "", actionCategoryId: "", actionHide: false, actionTagNames: "", applyExisting: true });
    load();
  }

  return (
    <div className="space-y-4">
      <Link href="/settings" className="ios-back">
        <span className="inline-flex rotate-180" aria-hidden>
          <Icon name="chevron" size={18} />
        </span>
        Settings
      </Link>
      <h1 className="pixel-title text-3xl">Rules</h1>
      <p className="text-sm text-ink-soft">If a shop name matches, put the item on the right shelf automatically.</p>
      <ul className="space-y-2">
        {rules.map((r) => (
          <li key={r.id} className="pixel-panel flex items-center justify-between p-3 text-sm">
            <div>
              <div className="font-semibold">{r.name}</div>
              <div className="text-ink-soft">
                if merchant has “{r.matchMerchant}” then {r.actionRename ? `rename ${r.actionRename}` : ""}{" "}
                {r.actionCategoryId ? "recategorize" : ""} {r.actionHide ? "hide" : ""} {r.actionTagNames ?? ""}
              </div>
            </div>
            <button className="pixel-btn danger" type="button" onClick={() => api(`/api/rules/${r.id}`, { method: "DELETE" }).then(load)}>
              Toss
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="pixel-panel grid gap-2 p-4 md:grid-cols-2">
        <input className="pixel-input" placeholder="Rule name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input className="pixel-input" placeholder="Merchant contains" value={form.matchMerchant} onChange={(e) => setForm({ ...form, matchMerchant: e.target.value })} />
        <input className="pixel-input" placeholder="Rename to" value={form.actionRename} onChange={(e) => setForm({ ...form, actionRename: e.target.value })} />
        <select className="pixel-input" value={form.actionCategoryId} onChange={(e) => setForm({ ...form, actionCategoryId: e.target.value })}>
          <option value="">Keep category</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input className="pixel-input" placeholder="Tags" value={form.actionTagNames} onChange={(e) => setForm({ ...form, actionTagNames: e.target.value })} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.actionHide} onChange={(e) => setForm({ ...form, actionHide: e.target.checked })} />
          Hide
        </label>
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input type="checkbox" checked={form.applyExisting} onChange={(e) => setForm({ ...form, applyExisting: e.target.checked })} />
          Apply to items already in the house
        </label>
        <button className="pixel-btn md:col-span-2">Save rule</button>
      </form>
    </div>
  );
}
