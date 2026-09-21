"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";

type Category = {
  id: string;
  name: string;
  flexBucket: string | null;
  rollover: boolean;
  groupId: string;
};

type Group = {
  id: string;
  name: string;
  color: string;
  categories: Category[];
};

const BUCKETS = [
  ["", "None"],
  ["fixed", "Fixed"],
  ["flex", "Flex"],
  ["non_monthly", "Non-monthly"],
] as const;

export default function SettingsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [newCat, setNewCat] = useState({ groupId: "", name: "" });

  const load = useCallback(() => {
    void api<{ groups: Group[] }>("/api/categories").then((r) => {
      setGroups(r.groups);
      if (r.groups[0]) setNewCat((current) => ({ ...current, groupId: current.groupId || r.groups[0].id }));
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function seed() {
    const res = await api<{ already?: boolean }>("/api/demo/seed", { method: "POST" });
    setStatus(res.already ? "Sample data is already loaded." : "Sample data loaded. It is on Home.");
  }

  async function changePw(e: FormEvent) {
    e.preventDefault();
    await api("/api/auth/password", { method: "POST", body: JSON.stringify(pw) });
    setStatus("Password changed.");
    setPw({ current: "", next: "" });
  }

  async function addCat(e: FormEvent) {
    e.preventDefault();
    await api("/api/categories", { method: "POST", body: JSON.stringify(newCat) });
    setNewCat((current) => ({ ...current, name: "" }));
    load();
  }

  async function saveCat(patch: { id: string; name?: string; groupId?: string; flexBucket?: string | null; rollover?: boolean }) {
    await api("/api/categories", { method: "PATCH", body: JSON.stringify(patch) });
    load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1>Settings</h1>
        <p>Categories, rules, export, and the password that opens your data.</p>
      </div>
      {status ? <p className="pixel-panel p-3 text-[15px]">{status}</p> : null}

      <section className="pixel-panel space-y-3 p-4">
        <h2 className="text-[20px] font-bold tracking-tight">Sample data</h2>
        <p className="text-[15px] text-[var(--muted)]">Load sample accounts, bills, and holdings before a bank is connected.</p>
        <button className="pixel-btn" type="button" onClick={seed}>
          Load sample data
        </button>
      </section>

      <section className="pixel-panel space-y-3 p-4">
        <h2 className="text-[20px] font-bold tracking-tight">Rules</h2>
        <p className="text-[15px] text-[var(--muted)]">Rename, categorize, hide, or tag transactions that match a merchant.</p>
        <Link href="/settings/rules" className="pixel-btn inline-flex">
          Manage rules
        </Link>
      </section>

      <section className="pixel-panel space-y-3 p-4">
        <h2 className="text-[20px] font-bold tracking-tight">Export</h2>
        <div className="flex gap-2">
          <a className="pixel-btn" href="/api/export?format=json">
            JSON
          </a>
          <a className="pixel-btn secondary" href="/api/export?format=csv">
            CSV
          </a>
        </div>
      </section>

      <form onSubmit={changePw} className="pixel-panel grid gap-2 p-4 md:grid-cols-2">
        <h2 className="text-[20px] font-bold tracking-tight md:col-span-2">Password</h2>
        <p className="text-[15px] text-[var(--muted)] md:col-span-2">This password opens the sealed balances and transactions.</p>
        <input className="pixel-input" type="password" placeholder="Current" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
        <input className="pixel-input" type="password" placeholder="New (12+)" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
        <button className="pixel-btn justify-self-start md:col-span-2">Change</button>
      </form>

      <section className="space-y-3">
        <h2 className="text-[20px] font-bold tracking-tight">Categories</h2>
        <form onSubmit={addCat} className="flex flex-wrap gap-2">
          <select className="pixel-input max-w-xs" value={newCat.groupId} onChange={(e) => setNewCat({ ...newCat, groupId: e.target.value })} aria-label="Group">
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          <input className="pixel-input max-w-xs" placeholder="New category" value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} required />
          <button className="pixel-btn">Add</button>
        </form>
        {groups.map((group) => (
          <section key={group.id}>
            <h3 className="ios-section" style={{ color: group.color }}>
              {group.name}
            </h3>
            <ul className="ios-group">
              {group.categories.map((category) => (
                <li key={category.id} className="space-y-2 border-b border-[var(--line)] px-4 py-3 last:border-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      className="pixel-input min-w-40 flex-1"
                      defaultValue={category.name}
                      key={category.name}
                      aria-label={`${category.name} name`}
                      onBlur={(e) => {
                        const name = e.target.value.trim();
                        if (name && name !== category.name) void saveCat({ id: category.id, name });
                      }}
                    />
                    <select
                      className="pixel-input max-w-40"
                      value={category.groupId}
                      aria-label={`${category.name} group`}
                      onChange={(e) => void saveCat({ id: category.id, groupId: e.target.value })}
                    >
                      {groups.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <select
                      className="pixel-input max-w-48"
                      value={category.flexBucket ?? ""}
                      aria-label={`${category.name} flex bucket`}
                      onChange={(e) => void saveCat({ id: category.id, flexBucket: e.target.value || null })}
                    >
                      {BUCKETS.map(([value, label]) => (
                        <option key={value || "none"} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="flex items-center gap-2 text-[15px] text-[var(--muted)]"
                      aria-pressed={category.rollover}
                      onClick={() => void saveCat({ id: category.id, rollover: !category.rollover })}
                    >
                      Rolls over
                      <span className={`switch ${category.rollover ? "on" : ""}`} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </section>

      <section className="pixel-panel space-y-2 p-4 text-[15px]">
        <h2 className="text-[20px] font-bold tracking-tight">Plaid Trial checklist</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Create an account at dashboard.plaid.com (Sandbox first).</li>
          <li>Copy PLAID_CLIENT_ID and PLAID_SECRET into .env or Railway variables.</li>
          <li>Set PLAID_ENV=sandbox, then production after Trial approval.</li>
          <li>Add redirect https://YOUR_APP/api/plaid/oauth and webhook https://YOUR_APP/api/plaid/webhook.</li>
          <li>Remember: 10 institution logins. Removing one does not free a slot.</li>
        </ol>
        <button className="pixel-btn ghost" type="button" onClick={() => fetch("/api/auth/logout", { method: "POST" }).then(() => (window.location.href = "/login"))}>
          Log out
        </button>
      </section>
    </div>
  );
}
