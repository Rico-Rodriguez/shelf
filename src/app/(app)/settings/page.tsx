"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { invalidateQueries } from "@/lib/use-query";
import { Icon } from "@/components/Icon";
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
      <PageHeader title="Settings" />
      {status ? <p className="card px-4 py-3 text-[15px]">{status}</p> : null}

      <HouseholdPanel onStatus={setStatus} />

      <section>
        <h2 className="ios-section">Appearance</h2>
        <div className="card">
          <div className="p-3">
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
          </div>
          <button
            className="data-row w-full text-left font-medium"
            type="button"
            onClick={() => {
              if (typeof Notification === "undefined") return;
              void Notification.requestPermission();
            }}
          >
            Allow alerts
          </button>
        </div>
      </section>

      {demoLoaded ? null : (
        <section>
          <h2 className="ios-section">Sample</h2>
          <div className="card">
            <button className="data-row w-full text-left font-medium" type="button" onClick={seed}>
              Load sample data
            </button>
          </div>
        </section>
      )}

      <section>
        <h2 className="ios-section">Rules</h2>
        <div className="card">
          <Link href="/settings/rules" className="data-row justify-between">
            <span className="font-medium">Manage rules</span>
            <Icon name="chevron" size={16} />
          </Link>
        </div>
      </section>

      <section>
        <h2 className="ios-section">Import</h2>
        <div className="card space-y-3 p-4">
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
            aria-label="CSV file. Positive amounts are money out."
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
          <p className="field-hint">Positive amounts are money out.</p>
        </div>
      </section>

      <section>
        <h2 className="ios-section">Export</h2>
        <div className="card">
          <a className="data-row justify-between" href="/api/export?format=json">
            <span className="font-medium">JSON</span>
            <Icon name="chevron" size={16} />
          </a>
          <a className="data-row justify-between" href="/api/export?format=csv">
            <span className="font-medium">CSV</span>
            <Icon name="chevron" size={16} />
          </a>
        </div>
      </section>

      <form onSubmit={changePw} className="card grid gap-4 p-4 md:grid-cols-2">
        <h2 className="ios-section mb-0 md:col-span-2">Password</h2>
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

      <section>
        <div className="card">
          <button
            className="data-row w-full text-left font-medium text-[var(--danger)]"
            type="button"
            onClick={() => {
              invalidateQueries();
              void fetch("/api/auth/logout", { method: "POST" }).then(() => (window.location.href = "/login"));
            }}
          >
            Log out
          </button>
        </div>
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
    onStatus("Share this code once.");
    load();
  }

  if (!data) return null;
  return (
    <section>
      <h2 className="ios-section">Household</h2>
      <div className="card">
        {data.members.map((member) => (
          <div key={member.userId} className="data-row justify-between gap-3">
            <span className="min-w-0 truncate font-medium">
              {member.name}
              {data.members.length > 1 ? <span className="font-normal capitalize text-[var(--muted)]"> {member.role}</span> : null}
            </span>
            {data.role === "owner" && member.role !== "owner" ? (
              <button className="text-[15px] font-medium text-[var(--danger)]" type="button" onClick={() => api("/api/household", { method: "DELETE", body: JSON.stringify({ userId: member.userId }) }).then(load)}>
                Remove
              </button>
            ) : null}
          </div>
        ))}
        {data.role === "owner" ? (
          <button className="data-row w-full text-left font-medium text-[var(--accent-ink)]" type="button" onClick={() => invite("member")}>
            Invite someone
          </button>
        ) : null}
      </div>
      {code ? <p className="mt-3 rounded-[12px] bg-[var(--paper)] px-4 py-3 font-mono text-[15px]">{code}</p> : null}
    </section>
  );
}

