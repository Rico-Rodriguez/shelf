"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";

type Group = {
  id: string;
  name: string;
  color: string;
  categories: { id: string; name: string; flexBucket: string | null; rollover: boolean }[];
};

const BUCKETS: Record<string, string> = {
  fixed: "Fixed",
  flex: "Flex",
  non_monthly: "Non-monthly",
};

function shelfMeta(bucket: string | null, rollover: boolean) {
  const parts = [bucket ? (BUCKETS[bucket] ?? bucket) : "", rollover ? "Rolls over" : ""].filter(Boolean);
  return parts.join(" · ");
}

export default function SettingsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [newCat, setNewCat] = useState({ groupId: "", name: "" });

  useEffect(() => {
    void api<{ groups: Group[] }>("/api/categories").then((r) => {
      setGroups(r.groups);
      if (r.groups[0]) setNewCat((c) => ({ ...c, groupId: r.groups[0].id }));
    });
  }, []);

  async function seed() {
    const res = await api<{ already?: boolean }>("/api/demo/seed", { method: "POST" });
    setStatus(res.already ? "Sample house was already unpacked." : "Sample house unpacked. Peek at Home.");
  }

  async function changePw(e: FormEvent) {
    e.preventDefault();
    await api("/api/auth/password", { method: "POST", body: JSON.stringify(pw) });
    setStatus("Lock changed.");
    setPw({ current: "", next: "" });
  }

  async function addCat(e: FormEvent) {
    e.preventDefault();
    await api("/api/categories", { method: "POST", body: JSON.stringify(newCat) });
    const r = await api<{ groups: Group[] }>("/api/categories");
    setGroups(r.groups);
    setNewCat({ ...newCat, name: "" });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="pixel-title text-3xl">Settings</h1>
        <p className="text-sm text-ink-soft">House rules, spare keys, and the back door.</p>
      </div>
      {status ? <p className="pixel-panel p-3 text-sm">{status}</p> : null}

      <section className="pixel-panel space-y-3 p-4">
        <h2 className="text-[20px] font-bold tracking-tight">Sample data</h2>
        <p className="text-sm text-ink-soft">
          Unpack a cozy set of jars, bills, and holdings so you can wander the rooms before Plaid keys are in.
        </p>
        <button className="pixel-btn" type="button" onClick={seed}>
          Unpack sample house
        </button>
      </section>

      <section className="pixel-panel space-y-3 p-4">
        <h2 className="pixel-title">Rules</h2>
        <p className="text-sm text-ink-soft">Automatically rename, recategorize, hide, tag, or split incoming items.</p>
        <Link href="/settings/rules" className="pixel-btn inline-block">
          Open the rule drawer
        </Link>
      </section>

      <section className="pixel-panel space-y-3 p-4">
        <h2 className="pixel-title">Export</h2>
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
        <h2 className="pixel-title md:col-span-2">Change the lock</h2>
        <p className="text-[15px] text-[var(--muted)] md:col-span-2">
          This password opens the sealed balances and transactions.
        </p>
        <input className="pixel-input" type="password" placeholder="Current" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
        <input className="pixel-input" type="password" placeholder="New (12+)" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
        <button className="pixel-btn justify-self-start md:col-span-2">Change</button>
      </form>

      <section className="pixel-panel space-y-3 p-4">
        <h2 className="pixel-title">Shelves (categories)</h2>
        <form onSubmit={addCat} className="flex flex-wrap gap-2">
          <select className="pixel-input max-w-xs" value={newCat.groupId} onChange={(e) => setNewCat({ ...newCat, groupId: e.target.value })}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <input className="pixel-input max-w-xs" placeholder="New category" value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} />
          <button className="pixel-btn">Add</button>
        </form>
        <div className="grid gap-x-10 gap-y-5 md:grid-cols-2">
          {groups.map((g) => (
            <div key={g.id}>
              <div className="pixel-title mb-1 text-sm" style={{ color: g.color }}>{g.name}</div>
              <ul className="text-sm">
                {g.categories.map((c) => (
                  <li key={c.id} className="flex items-baseline justify-between gap-3 border-b border-[var(--line)] py-1.5 last:border-0">
                    <span className="min-w-0 truncate">{c.name}</span>
                    <span className="shrink-0 text-xs text-ink-soft">{shelfMeta(c.flexBucket, c.rollover)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="pixel-panel space-y-2 p-4 text-sm">
        <h2 className="pixel-title">Plaid Trial checklist</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Create an account at dashboard.plaid.com (Sandbox first).</li>
          <li>Copy PLAID_CLIENT_ID and PLAID_SECRET into .env or Railway variables.</li>
          <li>Set PLAID_ENV=sandbox, then production after Trial approval.</li>
          <li>Add redirect https://YOUR_APP/api/plaid/oauth and webhook https://YOUR_APP/api/plaid/webhook.</li>
          <li>Remember: 10 institution logins. Removing one does not free a slot.</li>
        </ol>
        <button className="pixel-btn ghost" type="button" onClick={() => fetch("/api/auth/logout", { method: "POST" }).then(() => (window.location.href = "/login"))}>
          Lock the door
        </button>
      </section>
    </div>
  );
}
