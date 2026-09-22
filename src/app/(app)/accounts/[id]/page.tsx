"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConnectBank } from "@/components/ConnectBank";
import { useConfirmFlash } from "@/components/ConfirmFlash";
import { Icon } from "@/components/Icon";
import { MoneyText } from "@/components/MoneyText";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageError, PageSkeleton } from "@/components/ui/PageShell";
import { SummaryCard } from "@/components/ui/SummaryCard";
import { api } from "@/lib/client";
import { activityHref } from "@/lib/activity";
import { shortDate } from "@/lib/dates";
import { classifyAccount } from "@/lib/money";
import { invalidateQueries, useQuery } from "@/lib/use-query";
import { payoffMonths } from "@/lib/voice";

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

type ListPayload = { accounts: Account[]; items: Item[] };
type DetailPayload = {
  account: Account;
  snapshots: { date: string; balanceCents: number }[];
  liability: Liability | null;
  transactions: Tx[];
};
type Holding = { id: string; institutionValueCents: number; account: { id: string } | null; security: { name: string; ticker: string | null; type: string | null } | null };

export default function AccountDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { flash, run } = useConfirmFlash();
  const { data: list } = useQuery<ListPayload>("accounts", "/api/accounts");
  const { data: detail, loading, error, reload } = useQuery<DetailPayload>(`account:${id}`, `/api/accounts/${id}`);
  const acct = detail?.account ?? list?.accounts.find((account) => account.id === id) ?? null;
  const { data: investments } = useQuery<{ holdings: Holding[] }>(acct?.type === "investment" ? "investments" : null, "/api/investments");
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [scrub, setScrub] = useState<{ date: string; cents: number } | null>(null);

  useEffect(() => {
    if (!acct) return;
    setName(acct.name);
    setBalance((acct.currentBalanceCents / 100).toFixed(2));
  }, [acct]);

  if (!acct && loading) return <PageSkeleton variant="accounts" />;
  if (!acct) {
    if (error) return <PageError title="Account" message={error} onRetry={() => void reload()} />;
    return <p className="text-[var(--muted)]">That account is gone.</p>;
  }

  const item = acct.plaidItemId ? list?.items.find((row) => row.id === acct.plaidItemId) ?? null : null;
  const txs = detail?.transactions ?? [];
  const snapshots = detail?.snapshots ?? [];
  const liability = detail?.liability ?? null;
  const holds = (investments?.holdings ?? []).filter((holding) => holding.account?.id === id);
  const isDebt = classifyAccount(acct.type) === "liability";
  const signed = isDebt ? -Math.abs(acct.currentBalanceCents) : acct.currentBalanceCents;
  const limit =
    acct.type === "credit" && acct.availableBalanceCents != null ? Math.abs(acct.currentBalanceCents) + acct.availableBalanceCents : null;
  const usedPct = limit && limit > 0 ? Math.round((Math.abs(acct.currentBalanceCents) / limit) * 100) : null;
  const balancePoints = snapshots.map((row) => ({
    date: row.date,
    cents: isDebt ? -Math.abs(row.balanceCents) : row.balanceCents,
  }));

  function refresh() {
    invalidateQueries("accounts");
    invalidateQueries(`account:${id}`);
    invalidateQueries("dashboard");
    reload();
  }

  async function save() {
    await run(async () => {
      await api(`/api/accounts/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, currentBalance: Number(balance) }),
      });
    });
    refresh();
  }

  async function patchFlags(next: { includeInNetWorth?: boolean; isHidden?: boolean }) {
    await api(`/api/accounts/${id}`, { method: "PATCH", body: JSON.stringify(next) });
    refresh();
  }

  async function remove() {
    await api(`/api/accounts/${id}`, { method: "DELETE" });
    invalidateQueries("accounts");
    invalidateQueries(`account:${id}`);
    invalidateQueries("dashboard");
    router.push("/accounts");
  }

  async function disconnectBank() {
    const itemId = acct?.plaidItemId;
    if (!itemId) return;
    await api(`/api/plaid/items/${itemId}`, { method: "DELETE" });
    invalidateQueries("accounts");
    invalidateQueries(`account:${id}`);
    router.push("/accounts");
  }

  return (
    <div className="screen">
      {flash}
      <Link href="/accounts" className="ios-back">
        <span className="inline-flex rotate-180" aria-hidden>
          <Icon name="chevron" size={18} />
        </span>
        Accounts
      </Link>
      <PageHeader
        title={acct.name}
        subtitle={
          item && item.status !== "ok"
            ? `${item.institutionName || "Bank"} · ${item.errorCode || "Needs attention"}`
            : item?.institutionName || undefined
        }
      />
      <SummaryCard
        label={scrub ? shortDate(scrub.date) : "Balance"}
        cents={scrub?.cents ?? signed}
        signed={isDebt}
        status={
          usedPct == null
            ? null
            : { label: `${usedPct}% of the limit`, tone: usedPct >= 90 ? "bad" : usedPct >= 70 ? "warn" : "neutral" }
        }
        points={balancePoints}
        chartLabel="Balance over time"
        onScrub={(point) => setScrub(point?.date ? { date: point.date, cents: point.cents } : null)}
        footer={
          acct.availableBalanceCents != null ? (
            <>
              <MoneyText cents={acct.availableBalanceCents} /> available
            </>
          ) : null
        }
      />
      {item && item.status !== "ok" ? <ConnectBank itemId={item.id} label="Reconnect" onLinked={refresh} /> : null}

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
        {acct.plaidItemId ? (
          <button type="button" className="data-row w-full text-left text-[var(--danger)]" onClick={() => void disconnectBank()}>
            Disconnect bank
          </button>
        ) : null}
      </div>

      <div className="card max-w-lg space-y-3 p-4">
        <label className="block text-[15px]">
          Name
          <input className="shelf-input mt-1" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block text-[15px]">
          Balance
          <input className="shelf-input mt-1" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} />
        </label>
        <div className="flex gap-2">
          <button className="shelf-btn" type="button" onClick={() => void save()}>
            Save
          </button>
          <button className="shelf-btn danger" type="button" onClick={() => void remove()}>
            Remove account
          </button>
        </div>
      </div>

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
