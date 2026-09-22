"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { invalidateQueries } from "@/lib/use-query";
import { PageHeader } from "@/components/ui/PageHeader";
import { Segment } from "@/components/ui/Segment";

export default function SettingsPage() {
  const [status, setStatus] = useState<string | null>(null);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [demoLoaded, setDemoLoaded] = useState(true);
  const [theme, setTheme] = useState("system");
  const [importAccount, setImportAccount] = useState("");
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    void api<{ demoLoaded?: boolean }>("/api/auth/session").then((res) => setDemoLoaded(Boolean(res.demoLoaded))).catch(() => setDemoLoaded(false));
    void api<{ accounts: { id: string; name: string }[] }>("/api/accounts").then((res) => {
      setAccounts(res.accounts);
      if (res.accounts[0]) setImportAccount((current) => current || res.accounts[0].id);
    }).catch(() => undefined);
    const stored = window.localStorage.getItem("shelf-theme");
    setTheme(stored === "dark" || stored === "light" ? stored : "system");
  }, []);

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

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Household, appearance, and your password." />
      {status ? <p className="card p-3 text-[15px]">{status}</p> : null}

      <HouseholdPanel onStatus={setStatus} />

      <section className="card space-y-3 p-4">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Appearance</h2>
        <Segment
          value={theme}
          onChange={(mode) => {
            setTheme(mode);
            if (mode === "system") {
              window.localStorage.removeItem("shelf-theme");
              delete document.documentElement.dataset.theme;
            } else {
              window.localStorage.setItem("shelf-theme", mode);
              document.documentElement.dataset.theme = mode;
            }
          }}
          options={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
        <button
          className="text-btn"
          type="button"
          onClick={() => {
            if (typeof Notification === "undefined") return;
            void Notification.requestPermission();
          }}
        >
          Allow alerts
        </button>
        <p className="text-[13px] text-[var(--muted)]">Search with Ctrl or Cmd K.</p>
      </section>

      {demoLoaded ? null : (
      <section className="card space-y-3 p-4">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Sample data</h2>
        <p className="text-[15px] text-[var(--muted)]">Load sample accounts, bills, and holdings before a bank is connected.</p>
        <button className="shelf-btn" type="button" onClick={seed}>
          Load sample data
        </button>
      </section>
      )}

      <section className="card space-y-3 p-4">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Rules</h2>
        <p className="text-[15px] text-[var(--muted)]">Rename, categorize, hide, or tag transactions that match a merchant.</p>
        <Link href="/settings/rules" className="text-btn">
          Manage rules
        </Link>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Import</h2>
        <p className="text-[15px] text-[var(--muted)]">CSV with date, name, and amount. Positive amounts are money out.</p>
        <select className="shelf-input" value={importAccount} onChange={(event) => setImportAccount(event.target.value)} aria-label="Import account">
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
        <input
          className="text-[14px]"
          type="file"
          accept=".csv,text/csv"
          aria-label="CSV file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file || !importAccount) return;
            void file.text().then((csv) =>
              api<{ created: number }>("/api/import", { method: "POST", body: JSON.stringify({ accountId: importAccount, csv }) }).then((res) => {
                setStatus(`Imported ${res.created} transactions.`);
              }),
            );
          }}
        />
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Export</h2>
        <div className="flex gap-4">
          <a className="text-btn" href="/api/export?format=json">
            JSON
          </a>
          <a className="text-btn" href="/api/export?format=csv">
            CSV
          </a>
        </div>
      </section>

      <form onSubmit={changePw} className="card grid gap-4 p-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Password</h2>
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

      <section className="card space-y-2 p-4 text-[15px]">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Session</h2>
        <button
          className="text-btn"
          type="button"
          onClick={() => {
            invalidateQueries();
            void fetch("/api/auth/logout", { method: "POST" }).then(() => (window.location.href = "/login"));
          }}
        >
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
    <section className="card space-y-3 p-4">
      <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Household</h2>
      <p className="text-[15px] text-[var(--muted)]">People you invite share this vault. The code works once.</p>
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
            Invite someone
          </button>
        </div>
      ) : null}
      {code ? <p className="rounded-[10px] bg-[var(--fill)] p-3 font-mono text-[14px]">{code}</p> : null}
      <p className="text-[13px] text-[var(--muted)]">
        They open Shelf, choose Join, and enter the code.
      </p>
    </section>
  );
}

