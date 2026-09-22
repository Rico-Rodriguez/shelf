"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { MoneyText } from "@/components/MoneyText";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/client";
import { activityHref } from "@/lib/activity";
import { classifyAccount, formatMoney } from "@/lib/money";
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";

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

type Tx = { id: string; name: string; amountCents: number; date: string; categoryId: string | null };
type Liability = { kind: string; apr: number | null; minimumCents: number | null; due: string | null };

export default function AccountDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [acct, setAcct] = useState<Account | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [snapshots, setSnapshots] = useState<{ date: string; balanceCents: number }[]>([]);
  const [liability, setLiability] = useState<Liability | null>(null);
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
    void api<{ account: Account; snapshots: { date: string; balanceCents: number }[]; liability: Liability | null; transactions: Tx[] }>(
      `/api/accounts/${id}`,
    )
      .then((res) => {
        setSnapshots(res.snapshots);
        setLiability(res.liability);
        setTxs(res.transactions);
      })
      .catch(() => undefined);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (missing) return <p className="text-[var(--muted)]">That account is gone.</p>;
  if (!acct) return <p className="text-[var(--muted)]">Loading…</p>;

  const signed = classifyAccount(acct.type) === "liability" ? -Math.abs(acct.currentBalanceCents) : acct.currentBalanceCents;

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
      <PageHeader
        title={acct.name}
        subtitle={
          <>
            {item?.institutionName || (acct.isManual ? "Manual account" : "Account")}
            {item && item.status !== "ok" ? ` · ${item.errorCode || item.status}` : item ? " · Connected" : ""}
          </>
        }
      />
      <div className="text-[34px] font-bold leading-[41px] tracking-[-0.4px]">
        <MoneyText cents={signed} signed={classifyAccount(acct.type) === "liability"} />
      </div>

      <div className="card">
        <button
          type="button"
          className="data-row w-full justify-between text-[17px]"
          aria-pressed={acct.includeInNetWorth}
          onClick={() => patchFlags({ includeInNetWorth: !acct.includeInNetWorth })}
        >
          Include in net worth
          <span className={`switch ${acct.includeInNetWorth ? "on" : ""}`} />
        </button>
        <button type="button" className="data-row w-full justify-between text-[17px]" aria-pressed={acct.isHidden} onClick={() => patchFlags({ isHidden: !acct.isHidden })}>
          Hidden
          <span className={`switch ${acct.isHidden ? "on" : ""}`} />
        </button>
      </div>

      <div className="shelf-panel max-w-lg space-y-3 p-4">
        <label className="block text-[15px]">
          Name
          <input className="shelf-input mt-1" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block text-[15px]">
          Balance
          <input className="shelf-input mt-1" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} />
        </label>
        <div className="flex gap-2">
          <button className="shelf-btn" type="button" onClick={save}>
            Save
          </button>
          <button className="shelf-btn danger" type="button" onClick={remove}>
            Remove account
          </button>
        </div>
      </div>

      {snapshots.length > 1 ? (
        <div className="shelf-panel h-28 p-3">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={snapshots.map((row) => ({ ...row, value: row.balanceCents / 100 }))}>
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Tooltip formatter={(value) => formatMoney(Math.round(Number(value) * 100))} />
              <Area dataKey="value" stroke="#1f4d45" fill="rgba(31,77,69,0.12)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {liability ? (
        <section>
          <h2 className="ios-section">Loan details</h2>
          <ul className="card">
            <li className="data-row justify-between gap-3">
              <span className="text-[var(--muted)]">APR</span>
              <span>{liability.apr == null ? "—" : `${liability.apr}%`}</span>
            </li>
            <li className="data-row justify-between gap-3">
              <span className="text-[var(--muted)]">Minimum payment</span>
              <span>{liability.minimumCents == null ? "—" : <MoneyText cents={liability.minimumCents} />}</span>
            </li>
            <li className="data-row justify-between gap-3">
              <span className="text-[var(--muted)]">Next due</span>
              <span>{liability.due ?? "—"}</span>
            </li>
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="ios-section">Recent activity</h2>
        <div className="card">
          {txs.map((tx) => (
            <div key={tx.id} className="data-row justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[17px]">{tx.name}</div>
                <div className="truncate text-[13px] text-[var(--muted)]">
                  {tx.date}
                </div>
              </div>
              <MoneyText cents={-tx.amountCents} signed />
            </div>
          ))}
          {txs.length === 0 ? <div className="data-row text-[var(--muted)]">No transactions yet.</div> : null}
        </div>
        <Link href={activityHref({ accountId: id })} className="mt-2 inline-block text-[17px] text-[var(--ink)]">
          All activity
        </Link>
      </section>
    </div>
  );
}
