"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { PageHeader } from "@/components/ui/PageHeader";

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
      <PageHeader title="Settings" subtitle="Household, categories, connections, and the password that opens your data." />
      {status ? <p className="shelf-panel p-3 text-[15px]">{status}</p> : null}

      <section className="shelf-panel space-y-3 p-4">
        <h2 className="text-[20px] font-bold tracking-tight">Sample data</h2>
        <p className="text-[15px] text-[var(--muted)]">Load sample accounts, bills, and holdings before a bank is connected.</p>
        <button className="shelf-btn" type="button" onClick={seed}>
          Load sample data
        </button>
      </section>

      <section className="shelf-panel space-y-3 p-4">
        <h2 className="text-[20px] font-bold tracking-tight">Rules</h2>
        <p className="text-[15px] text-[var(--muted)]">Rename, categorize, hide, or tag transactions that match a merchant.</p>
        <Link href="/settings/rules" className="shelf-btn inline-flex">
          Manage rules
        </Link>
      </section>

      <section className="shelf-panel space-y-3 p-4">
        <h2 className="text-[20px] font-bold tracking-tight">Export</h2>
        <div className="flex gap-2">
          <a className="shelf-btn" href="/api/export?format=json">
            JSON
          </a>
          <a className="shelf-btn secondary" href="/api/export?format=csv">
            CSV
          </a>
        </div>
      </section>

      <form onSubmit={changePw} className="shelf-panel grid gap-4 p-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <h2 className="text-[18px] font-semibold tracking-tight">Password</h2>
          <p className="mt-1 text-[14px] text-[var(--muted)]">This password opens the sealed balances and transactions.</p>
        </div>
        <label className="field">
          <span className="field-label">Current password</span>
          <input className="shelf-input" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">New password</span>
          <input className="shelf-input" type="password" placeholder="12+ characters" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
        </label>
        <button className="shelf-btn justify-self-start md:col-span-2">Change password</button>
      </form>

      <section className="space-y-3">
        <h2 className="text-[20px] font-bold tracking-tight">Categories</h2>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            void api("/api/categories", {
              method: "POST",
              body: JSON.stringify({ entity: "group", name: String(form.get("group") || ""), kind: "expense" }),
            }).then(load);
            e.currentTarget.reset();
          }}
        >
          <input className="shelf-input max-w-xs" name="group" placeholder="New group" required />
          <button className="shelf-btn secondary">Add group</button>
        </form>
        <form onSubmit={addCat} className="flex flex-wrap gap-2">
          <select className="shelf-input max-w-xs" value={newCat.groupId} onChange={(e) => setNewCat({ ...newCat, groupId: e.target.value })} aria-label="Group">
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          <input className="shelf-input max-w-xs" placeholder="New category" value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} required />
          <button className="shelf-btn">Add</button>
        </form>
        {groups.map((group) => (
          <section key={group.id}>
            <h3 className="ios-section flex items-center justify-between" style={{ color: group.color }}>
              <span>{group.name}</span>
              <span className="flex gap-2">
                <button
                  type="button"
                  className="text-[var(--muted)]"
                  onClick={() => {
                    const index = groups.findIndex((item) => item.id === group.id);
                    if (index <= 0) return;
                    const order = groups.map((item, i) => ({ id: item.id, sortOrder: i, entity: "group" as const }));
                    const prev = order[index - 1];
                    order[index - 1] = order[index];
                    order[index] = prev;
                    void api("/api/categories", { method: "PATCH", body: JSON.stringify({ order: order.map((item, i) => ({ ...item, sortOrder: i })) }) }).then(load);
                  }}
                >
                  Up
                </button>
                <button className="text-[var(--danger)]" type="button" onClick={() => void api("/api/categories", { method: "DELETE", body: JSON.stringify({ id: group.id, entity: "group" }) }).then(load)}>
                  Delete
                </button>
              </span>
            </h3>
            <ul className="card">
              {group.categories.map((category) => (
                <li key={category.id} className="space-y-2 border-b border-[var(--line)] px-4 py-3 last:border-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      className="shelf-input min-w-40 flex-1"
                      defaultValue={category.name}
                      key={category.name}
                      aria-label={`${category.name} name`}
                      onBlur={(e) => {
                        const name = e.target.value.trim();
                        if (name && name !== category.name) void saveCat({ id: category.id, name });
                      }}
                    />
                    <select
                      className="shelf-input max-w-40"
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
                      className="shelf-input max-w-48"
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
                    <button className="text-[13px] font-medium text-[var(--danger)]" type="button" onClick={() => void api("/api/categories", { method: "DELETE", body: JSON.stringify({ id: category.id, entity: "category" }) }).then(load)}>
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </section>

      <HouseholdPanel onStatus={setStatus} />
      <TagsPanel />
      <ConnectionsPanel />

      <section className="shelf-panel space-y-2 p-4 text-[15px]">
        <h2 className="text-[20px] font-semibold tracking-tight">Session</h2>
        <button className="shelf-btn ghost" type="button" onClick={() => fetch("/api/auth/logout", { method: "POST" }).then(() => (window.location.href = "/login"))}>
          Log out
        </button>
      </section>
    </div>
  );
}

function HouseholdPanel({ onStatus }: { onStatus: (message: string) => void }) {
  const [data, setData] = useState<{
    role: string;
    members: { userId: string; role: string; name: string }[];
    invites: { id: string; role: string }[];
  } | null>(null);
  const [code, setCode] = useState<string | null>(null);

  const load = useCallback(() => {
    void api<NonNullable<typeof data>>("/api/household").then(setData).catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function invite(role: "member" | "advisor") {
    const res = await api<{ code: string }>("/api/household/invites", { method: "POST", body: JSON.stringify({ role }) });
    setCode(res.code);
    onStatus("Share this code once. It is not shown again.");
    load();
  }

  if (!data) return null;
  return (
    <section className="shelf-panel space-y-3 p-4">
      <h2 className="text-[20px] font-semibold tracking-tight">Household</h2>
      <p className="text-[15px] text-[var(--muted)]">Members share this vault and can edit. Advisors see the same screens and cannot change anything.</p>
      <ul className="space-y-2 text-[15px]">
        {data.members.map((member) => (
          <li key={member.userId} className="flex items-center justify-between gap-3">
            <span>
              {member.name} <span className="text-[var(--muted)]">{member.role}</span>
            </span>
            {data.role === "owner" ? (
              <button className="text-[13px] text-[var(--danger)]" type="button" onClick={() => api("/api/household", { method: "DELETE", body: JSON.stringify({ userId: member.userId }) }).then(load)}>
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {data.role === "owner" ? (
        <div className="flex flex-wrap gap-2">
          <button className="shelf-btn" type="button" onClick={() => invite("member")}>
            Invite member
          </button>
          <button className="shelf-btn secondary" type="button" onClick={() => invite("advisor")}>
            Invite advisor
          </button>
        </div>
      ) : null}
      {code ? <p className="rounded-[10px] bg-[var(--fill)] p-3 font-mono text-[14px]">{code}</p> : null}
      <p className="text-[13px] text-[var(--muted)]">
        New people open <span className="font-medium">/join</span> and enter the code.
      </p>
    </section>
  );
}

function TagsPanel() {
  const [tags, setTags] = useState<{ id: string; name: string; color: string }[]>([]);
  const [name, setName] = useState("");
  const load = useCallback(() => {
    void api<{ tags: { id: string; name: string; color: string }[] }>("/api/tags").then((r) => setTags(r.tags));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <section className="shelf-panel space-y-3 p-4">
      <h2 className="text-[20px] font-semibold tracking-tight">Tags</h2>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void api("/api/tags", { method: "POST", body: JSON.stringify({ name }) }).then(() => {
            setName("");
            load();
          });
        }}
      >
        <input className="shelf-input" placeholder="New tag" value={name} onChange={(e) => setName(e.target.value)} required />
        <button className="shelf-btn">Add</button>
      </form>
      <ul className="space-y-2">
        {tags.map((tag) => (
          <li key={tag.id} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span className="size-2.5 rounded-full" style={{ background: tag.color }} />
              {tag.name}
            </span>
            <button className="text-[13px] text-[var(--danger)]" type="button" onClick={() => api("/api/tags", { method: "DELETE", body: JSON.stringify({ id: tag.id }) }).then(load)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ConnectionsPanel() {
  const [items, setItems] = useState<{ institutionName: string | null; status: string; errorCode: string | null }[]>([]);
  useEffect(() => {
    void api<{ items: { institutionName: string | null; status: string; errorCode: string | null }[]; plaidConfigured: boolean }>("/api/accounts").then((r) =>
      setItems(r.items),
    );
  }, []);
  return (
    <section className="shelf-panel space-y-2 p-4">
      <h2 className="text-[20px] font-semibold tracking-tight">Connections</h2>
      {items.length === 0 ? (
        <p className="text-[15px] text-[var(--muted)]">
          No banks connected. <Link href="/accounts" className="text-link">Connect one from Accounts.</Link>
        </p>
      ) : (
        <p className="text-[15px] text-[var(--muted)]">
          Connect, refresh, and disconnect live on <Link href="/accounts" className="text-link">Accounts</Link>.
        </p>
      )}
      <ul className="space-y-1 text-[15px]">
        {items.map((item, index) => (
          <li key={index}>
            {item.institutionName || "Bank"} · {item.status === "ok" ? "Connected" : item.errorCode || item.status}
          </li>
        ))}
      </ul>
    </section>
  );
}
