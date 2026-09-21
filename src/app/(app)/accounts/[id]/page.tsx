"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { MoneyText } from "@/components/MoneyText";
import { api } from "@/lib/client";
import { activityHref } from "@/lib/activity";
import { classifyAccount } from "@/lib/money";

type Account = {
  id: string;
  name: string;
  type: string;
  currentBalanceCents: number;
  includeInNetWorth: boolean;
  isHidden: boolean;
  isManual: boolean;
  plaidItemId: string | null;
  liabilityJson: string | null;
};

type Item = { id: string; institutionName: string | null; status: string; errorCode: string | null };

type Tx = { id: string; name: string; amountCents: number; date: string; category: { name: string } | null };

export default function AccountDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [acct, setAcct] = useState<Account | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [missing, setMissing] = useState(false);

  const load = useCallback(() => {
    void api<{ accounts: Account[]; items: Item[] }>("/api/accounts").then((res) => {
      const found = res.accounts.find((account) => account.id === id);
      if (!found) {
        setMissing(true);
        return;
      }
      setAcct(found);
      setName(found.name);
      setBalance((found.currentBalanceCents / 100).toFixed(2));
      setItem(found.plaidItemId ? res.items.find((row) => row.id === found.plaidItemId) ?? null : null);
    });
    void api<{ transactions: Tx[] }>(`/api/transactions?accountId=${id}&limit=12`).then((res) => setTxs(res.transactions));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (missing) return <p className="text-[var(--muted)]">That account is gone.</p>;
  if (!acct) return <p className="text-[var(--muted)]">Loading…</p>;

  const signed = classifyAccount(acct.type) === "liability" ? -Math.abs(acct.currentBalanceCents) : acct.currentBalanceCents;
  let liability: Record<string, unknown> | null = null;
  try {
    liability = acct.liabilityJson ? (JSON.parse(acct.liabilityJson) as Record<string, unknown>) : null;
  } catch {
    liability = null;
  }

  async function save() {
    await api(`/api/accounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name, currentBalance: Number(balance) }),
    });
    load();
  }

  async function patchFlags(next: { includeInNetWorth?: boolean; isHidden?: boolean }) {
    setAcct((current) => (current ? { ...current, ...next } : current));
    await api(`/api/accounts/${id}`, { method: "PATCH", body: JSON.stringify(next) });
  }

  async function remove() {
    await api(`/api/accounts/${id}`, { method: "DELETE" });
    window.location.href = "/accounts";
  }

  return (
    <div className="space-y-4">
      <Link href="/accounts" className="ios-back">
        <span className="inline-flex rotate-180" aria-hidden>
          <Icon name="chevron" size={18} />
        </span>
        Accounts
      </Link>
      <div>
        <h1>{acct.name}</h1>
        <p>
          {item?.institutionName || (acct.isManual ? "Manual account" : "Account")}
          {item && item.status !== "ok" ? ` · ${item.errorCode || item.status}` : item ? " · Connected" : ""}
        </p>
      </div>
      <div className="text-[34px] font-bold leading-[41px] tracking-[-0.4px]">
        <MoneyText cents={signed} signed={classifyAccount(acct.type) === "liability"} />
      </div>

      <div className="ios-group">
        <button
          type="button"
          className="ios-row w-full justify-between text-[17px]"
          aria-pressed={acct.includeInNetWorth}
          onClick={() => patchFlags({ includeInNetWorth: !acct.includeInNetWorth })}
        >
          Include in net worth
          <span className={`switch ${acct.includeInNetWorth ? "on" : ""}`} />
        </button>
        <button type="button" className="ios-row w-full justify-between text-[17px]" aria-pressed={acct.isHidden} onClick={() => patchFlags({ isHidden: !acct.isHidden })}>
          Hidden
          <span className={`switch ${acct.isHidden ? "on" : ""}`} />
        </button>
      </div>

      <div className="pixel-panel max-w-lg space-y-3 p-4">
        <label className="block text-[15px]">
          Name
          <input className="pixel-input mt-1" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block text-[15px]">
          Balance
          <input className="pixel-input mt-1" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} />
        </label>
        <div className="flex gap-2">
          <button className="pixel-btn" type="button" onClick={save}>
            Save
          </button>
          <button className="pixel-btn danger" type="button" onClick={remove}>
            Remove account
          </button>
        </div>
      </div>

      {liability ? (
        <section>
          <h2 className="ios-section">Loan details</h2>
          <ul className="ios-group">
            {Object.entries(liability)
              .filter(([, value]) => value != null && typeof value !== "object")
              .map(([key, value]) => (
                <li key={key} className="ios-row justify-between gap-3">
                  <span className="text-[var(--muted)]">{key.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}</span>
                  <span className="truncate">{String(value)}</span>
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="ios-section">Recent activity</h2>
        <div className="ios-group">
          {txs.map((tx) => (
            <div key={tx.id} className="ios-row justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[17px]">{tx.name}</div>
                <div className="truncate text-[13px] text-[var(--muted)]">
                  {tx.date}
                  {tx.category?.name ? ` · ${tx.category.name}` : ""}
                </div>
              </div>
              <MoneyText cents={-tx.amountCents} signed />
            </div>
          ))}
          {txs.length === 0 ? <div className="ios-row text-[var(--muted)]">No transactions yet.</div> : null}
        </div>
        <Link href={activityHref({ accountId: id })} className="mt-2 inline-block text-[17px] text-[var(--terracotta)]">
          All activity
        </Link>
      </section>
    </div>
  );
}
