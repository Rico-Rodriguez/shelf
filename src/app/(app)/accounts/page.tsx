"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ConnectBank } from "@/components/ConnectBank";
import { MoneyText } from "@/components/MoneyText";
import { api } from "@/lib/client";
import { classifyAccount } from "@/lib/money";

type Account = {
  id: string;
  name: string;
  type: string;
  subtype: string | null;
  mask: string | null;
  currentBalanceCents: number;
  isManual: boolean;
  isHidden: boolean;
  includeInNetWorth: boolean;
  liabilityJson: string | null;
};

type Payload = {
  accounts: Account[];
  items: { id: string; institutionName: string | null; status: string }[];
  itemCount: number;
  trialLimit: number;
  plaidConfigured: boolean;
};

export default function AccountsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("depository");
  const [balance, setBalance] = useState("");
  const [kind, setKind] = useState("cash");

  const load = useCallback(() => {
    void api<Payload>("/api/accounts").then(setData);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addManual(e: FormEvent) {
    e.preventDefault();
    await api("/api/accounts", {
      method: "POST",
      body: JSON.stringify({
        name,
        type: kind === "property" || kind === "vehicle" ? "other" : type,
        currentBalance: Number(balance || 0),
        manualKind: kind,
      }),
    });
    setName("");
    setBalance("");
    load();
  }

  async function sync() {
    await api("/api/plaid/sync", { method: "POST", body: "{}" });
    load();
  }

  if (!data) return <p className="pixel-title text-ink-soft">Counting jars…</p>;

  const assets = data.accounts.filter((a) => classifyAccount(a.type) === "asset" && !a.isHidden);
  const debts = data.accounts.filter((a) => classifyAccount(a.type) === "liability" && !a.isHidden);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="pixel-title text-3xl">Accounts</h1>
          <p className="text-sm text-ink-soft">
            Institution logins {data.itemCount}/{data.trialLimit}. Removing one does not free a Trial slot.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.plaidConfigured ? (
            <>
              <ConnectBank onLinked={load} />
              <button className="pixel-btn secondary" type="button" onClick={sync}>
                Refresh
              </button>
            </>
          ) : (
            <p className="max-w-xs text-sm text-ink-soft">
              Add Plaid keys in <code>.env</code> to connect real banks. Until then, add jars by hand or load the sample house in Settings.
            </p>
          )}
        </div>
      </div>

      {data.items.length > 0 && (
        <div className="pixel-panel p-3 text-sm">
          Linked: {data.items.map((i) => i.institutionName || i.id).join(" · ")}
        </div>
      )}

      <Group title="Assets" rows={assets} />
      <Group title="Owed" rows={debts} />

      <form onSubmit={addManual} className="pixel-panel grid gap-2 p-4 md:grid-cols-5">
        <h2 className="pixel-title md:col-span-5">Add a jar by hand</h2>
        <input className="pixel-input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <select className="pixel-input" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="cash">Cash / bank</option>
          <option value="property">Home</option>
          <option value="vehicle">Car</option>
          <option value="other">Other</option>
        </select>
        <select className="pixel-input" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="depository">Deposit</option>
          <option value="investment">Investment</option>
          <option value="credit">Credit card</option>
          <option value="loan">Loan</option>
          <option value="other">Other</option>
        </select>
        <input className="pixel-input" placeholder="Balance" value={balance} onChange={(e) => setBalance(e.target.value)} />
        <button className="pixel-btn">Put it on the shelf</button>
      </form>
    </div>
  );
}

function Group({ title, rows }: { title: string; rows: Account[] }) {
  return (
    <section className="space-y-2">
      <h2 className="ios-section">{title}</h2>
      <div className="ios-group">
        {rows.map((a) => (
          <Link key={a.id} href={`/accounts/${a.id}`} className="ios-row justify-between">
            <div>
              <div className="text-[17px] font-medium">{a.name}</div>
              <div className="text-[13px] text-[var(--muted)]">
                {a.subtype || a.type}
                {a.mask ? ` · ${a.mask}` : ""}
                {a.isManual ? " · manual" : ""}
              </div>
            </div>
            <MoneyText cents={classifyAccount(a.type) === "liability" ? -Math.abs(a.currentBalanceCents) : a.currentBalanceCents} signed={classifyAccount(a.type) === "liability"} />
          </Link>
        ))}
        {rows.length === 0 ? <div className="ios-row text-[var(--muted)]">None yet.</div> : null}
      </div>
    </section>
  );
}
