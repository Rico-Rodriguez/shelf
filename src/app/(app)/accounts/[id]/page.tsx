"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ConnectBank } from "@/components/ConnectBank";
import { Icon } from "@/components/Icon";
import { MoneyText } from "@/components/MoneyText";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/client";
import { activityHref } from "@/lib/activity";
import { classifyAccount } from "@/lib/money";
import { payoffMonths } from "@/lib/voice";
import { ScrubChart } from "@/components/ScrubChart";

type Account = {
  id: string;
  name: string;
  type: string;
  currentBalanceCents: number;
  availableBalanceCents?: number | null;
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
  const [holds, setHolds] = useState<{ id: string; institutionValueCents: number; security: { name: string; ticker: string | null; type: string | null } | null }[]>([]);

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

  useEffect(() => {
    if (!acct || acct.type !== "investment") return;
    void api<{ holdings: { id: string; institutionValueCents: number; account: { id: string } | null; security: { name: string; ticker: string | null; type: string | null } | null }[] }>(
      "/api/investments",
    ).then((res) => setHolds(res.holdings.filter((holding) => holding.account?.id === id)));
  }, [acct, id]);

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
      {acct.type === "credit" && acct.availableBalanceCents != null ? (
        <p className="text-[14px] text-[var(--muted)]">
          <MoneyText cents={acct.availableBalanceCents} /> available
          {Math.abs(acct.currentBalanceCents) + acct.availableBalanceCents > 0
            ? ` · ${Math.round((Math.abs(acct.currentBalanceCents) / (Math.abs(acct.currentBalanceCents) + acct.availableBalanceCents)) * 100)}% of the limit used`
            : ""}
          . Card payments are transfers, so they stay out of spending.
        </p>
      ) : null}
      {item && item.status !== "ok" ? <ConnectBank itemId={item.id} label="Reconnect" onLinked={load} /> : null}

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
        <ScrubChart points={snapshots.map((row) => ({ date: row.date, cents: row.balanceCents }))} />
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
          {liability.apr != null && liability.minimumCents != null ? (
            <p className="mt-2 text-[13px] text-[var(--muted)]">
              {(() => {
                const months = payoffMonths(acct.currentBalanceCents, liability.apr, liability.minimumCents);
                return months == null ? "The minimum does not cover interest." : `At the minimum, about ${months} months.`;
              })()}
            </p>
          ) : null}
        </section>
      ) : null}

      {holds.length ? (
        <section>
          <h2 className="ios-section">Holdings</h2>
          <div className="alloc-bar mb-3" aria-hidden>
            {allocation(holds).map((slice) => (
              <span key={slice.name} style={{ width: `${slice.pct}%`, background: slice.color }} />
            ))}
          </div>
          <ul className="card">
            {holds.map((holding) => (
              <li key={holding.id} className="data-row justify-between gap-3">
                <span className="min-w-0 truncate">{holding.security?.ticker || holding.security?.name || "Holding"}</span>
                <MoneyText cents={holding.institutionValueCents} />
              </li>
            ))}
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
        <Link href={activityHref({ accountId: id })} className="text-btn mt-2">
          All activity
        </Link>
      </section>
    </div>
  );
}

const HOLDING_TONES = ["var(--ink)", "color-mix(in srgb, var(--ink) 55%, transparent)", "var(--accent)", "color-mix(in srgb, var(--accent) 45%, transparent)"];

function allocation(rows: { institutionValueCents: number; security: { type: string | null } | null }[]) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = row.security?.type || "Other";
    map.set(key, (map.get(key) ?? 0) + row.institutionValueCents);
  }
  const total = [...map.values()].reduce((sum, cents) => sum + cents, 0) || 1;
  return [...map.entries()].map(([name, cents], index) => ({
    name,
    pct: (cents / total) * 100,
    color: HOLDING_TONES[index % HOLDING_TONES.length],
  }));
}
