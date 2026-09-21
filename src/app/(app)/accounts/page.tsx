"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ConnectBank } from "@/components/ConnectBank";
import { MoneyText } from "@/components/MoneyText";
import { Sheet } from "@/components/Sheet";
import { PageHeader } from "@/components/ui/PageHeader";
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
  plaidItemId: string | null;
};

type Item = { id: string; institutionName: string | null; status: string; errorCode: string | null };

type Payload = {
  accounts: Account[];
  items: Item[];
  itemCount: number;
  trialLimit: number;
  plaidConfigured: boolean;
};

export default function AccountsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [open, setOpen] = useState(false);
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

  const visible = useMemo(() => data?.accounts.filter((account) => !account.isHidden) ?? [], [data]);
  const assets = visible.filter((account) => classifyAccount(account.type) === "asset");
  const debts = visible.filter((account) => classifyAccount(account.type) === "liability");
  const assetTotal = assets.reduce((sum, account) => sum + account.currentBalanceCents, 0);
  const debtTotal = debts.reduce((sum, account) => sum + Math.abs(account.currentBalanceCents), 0);

  const institutions = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { key: string; name: string; rows: Account[] }>();
    for (const account of visible) {
      const item = account.plaidItemId ? data.items.find((row) => row.id === account.plaidItemId) : null;
      const key = item?.id ?? "manual";
      const bucket = map.get(key) ?? { key, name: item?.institutionName || (account.isManual ? "Manual" : "Bank"), rows: [] };
      bucket.rows.push(account);
      map.set(key, bucket);
    }
    return [...map.values()];
  }, [data, visible]);

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
    setOpen(false);
    load();
  }

  async function disconnect(itemId: string) {
    await api(`/api/plaid/items/${itemId}`, { method: "DELETE" });
    load();
  }

  async function sync() {
    await api("/api/plaid/sync", { method: "POST", body: "{}" });
    load();
  }

  if (!data) return <p className="text-[var(--muted)]">Loading…</p>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts"
        subtitle={
          <>
            Everything you own and owe, in one list. Assets <MoneyText cents={assetTotal} /> · Debts <MoneyText cents={debtTotal} />
            {data.plaidConfigured ? ` · ${data.itemCount}/${data.trialLimit} bank logins` : ""}
          </>
        }
      >
        <div className="flex flex-wrap gap-2">
          {data.plaidConfigured ? (
            <>
              <ConnectBank onLinked={load} />
              <button className="pixel-btn secondary" type="button" onClick={sync}>
                Refresh
              </button>
            </>
          ) : null}
          <button className="pixel-btn" type="button" onClick={() => setOpen(true)}>
            Add
          </button>
        </div>
      </PageHeader>

      {!data.plaidConfigured ? (
        <p className="text-[15px] text-[var(--muted)]">Add Plaid keys to connect a bank, or add an account by hand.</p>
      ) : null}

      {data.items.some((item) => item.status !== "ok") ? (
        <p className="text-[15px] text-[var(--danger)]">
          {data.items
            .filter((item) => item.status !== "ok")
            .map((item) => `${item.institutionName || "Bank"} needs attention${item.errorCode ? ` (${item.errorCode})` : ""}`)
            .join(" · ")}
        </p>
      ) : null}

      {institutions.length === 0 ? <p className="text-[15px] text-[var(--muted)]">No accounts yet.</p> : null}

      {institutions.map((group) => {
        const total = group.rows.reduce((sum, account) => {
          const amount = Math.abs(account.currentBalanceCents);
          return sum + (classifyAccount(account.type) === "liability" ? -amount : amount);
        }, 0);
        return (
          <section key={group.key}>
            <h2 className="ios-section flex items-center justify-between gap-3">
              <span>{group.name}</span>
              <span className="flex items-center gap-3">
                {group.key !== "manual" ? (
                  <button className="text-[13px] font-medium text-[var(--danger)]" type="button" onClick={() => disconnect(group.key)}>
                    Disconnect
                  </button>
                ) : null}
                <MoneyText cents={total} signed />
              </span>
            </h2>
            <div className="card">
              {group.rows.map((account) => (
                <Link key={account.id} href={`/accounts/${account.id}`} className="data-row justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[17px] font-medium">{account.name}</div>
                    <div className="truncate text-[13px] text-[var(--muted)]">
                      {account.subtype || account.type}
                      {account.mask ? ` · ${account.mask}` : ""}
                      {account.isManual ? " · manual" : ""}
                    </div>
                  </div>
                  <MoneyText
                    cents={classifyAccount(account.type) === "liability" ? -Math.abs(account.currentBalanceCents) : account.currentBalanceCents}
                    signed={classifyAccount(account.type) === "liability"}
                  />
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      {open ? (
        <Sheet title="Add an account" onClose={() => setOpen(false)}>
          <form
            onSubmit={addManual}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="field-stack">
              <label className="field">
                <span className="field-label">Name</span>
                <input className="pixel-input" placeholder="Checking, Home, Car…" value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <label className="field">
                <span className="field-label">Kind</span>
                <select className="pixel-input" value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="cash">Cash / bank</option>
                  <option value="property">Home</option>
                  <option value="vehicle">Car</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="field">
                <span className="field-label">Type</span>
                <select className="pixel-input" value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="depository">Deposit</option>
                  <option value="investment">Investment</option>
                  <option value="credit">Credit card</option>
                  <option value="loan">Loan</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="field">
                <span className="field-label">Balance</span>
                <input className="pixel-input" inputMode="decimal" placeholder="0.00" value={balance} onChange={(e) => setBalance(e.target.value)} />
              </label>
              <button className="pixel-btn w-full">Add account</button>
            </div>
          </form>
        </Sheet>
      ) : null}
    </div>
  );
}
