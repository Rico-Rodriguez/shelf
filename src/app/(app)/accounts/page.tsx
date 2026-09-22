"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { ConnectBank } from "@/components/ConnectBank";
import { useConfirmFlash } from "@/components/ConfirmFlash";
import { MoneyText } from "@/components/MoneyText";
import { Sheet } from "@/components/Sheet";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageError, PageShell, PageSkeleton } from "@/components/ui/PageShell";
import { SummaryCard } from "@/components/ui/SummaryCard";
import { api } from "@/lib/client";
import { classifyAccount } from "@/lib/money";
import { invalidateQueries, useQuery, warmQuery } from "@/lib/use-query";

type Account = {
  id: string;
  name: string;
  type: string;
  subtype: string | null;
  mask: string | null;
  currentBalanceCents: number;
  availableBalanceCents?: number | null;
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
  const { data, loading, refreshing, error, reload } = useQuery<Payload>("accounts", "/api/accounts");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("depository");
  const [balance, setBalance] = useState("");
  const [kind, setKind] = useState("cash");
  const { flash, run } = useConfirmFlash();

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
      const bucket = map.get(key) ?? { key, name: item?.institutionName || (account.isManual ? "Added by you" : "Bank"), rows: [] };
      bucket.rows.push(account);
      map.set(key, bucket);
    }
    return [...map.values()];
  }, [data, visible]);

  async function addManual(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      await api("/api/accounts", {
        method: "POST",
        body: JSON.stringify({
          name,
          type: kind === "property" || kind === "vehicle" ? "other" : type,
          currentBalance: Number(balance || 0),
          manualKind: kind,
        }),
      });
    });
    setName("");
    setBalance("");
    setOpen(false);
    invalidateQueries("accounts");
    reload();
  }

  async function sync() {
    await api("/api/plaid/sync", { method: "POST", body: "{}" });
    invalidateQueries("accounts");
    invalidateQueries("dashboard");
    reload();
  }

  if (!data && loading) return <PageSkeleton variant="accounts" />;
  if (!data) return <PageError title="Accounts" message={error} onRetry={() => void reload()} />;

  return (
    <PageShell refreshing={refreshing}>
    <div className="screen">
      {flash}
      <PageHeader title="Accounts">
        <button className="shelf-btn" type="button" onClick={() => setOpen(true)}>
          Add
        </button>
      </PageHeader>

      {visible.length > 0 ? (
        <SummaryCard
          label="Net worth"
          cents={assetTotal - debtTotal}
          shares={[
            { label: "Assets", cents: assetTotal, color: "var(--accent)" },
            { label: "Debts", cents: debtTotal, color: "var(--danger)" },
          ]}
        />
      ) : null}

      {data.items.some((item) => item.status !== "ok") ? (
        <div className="space-y-2">
          {data.items
            .filter((item) => item.status !== "ok")
            .map((item) => (
              <div key={item.id} className="shelf-panel flex flex-wrap items-center justify-between gap-3 p-4">
                <p className="text-[15px] text-[var(--danger)]">
                  {item.institutionName || "Bank"} needs attention{item.errorCode ? ` (${item.errorCode})` : ""}
                </p>
                <ConnectBank itemId={item.id} label="Reconnect" onLinked={reload} />
              </div>
            ))}
        </div>
      ) : null}

      {institutions.length === 0 ? <p className="text-[15px] text-[var(--muted)]">Add a bank or a balance to see it here.</p> : null}

      {data.plaidConfigured ? (
        <div className="card">
          <div className="data-row justify-between gap-3">
            <ConnectBank className="text-btn" onLinked={reload} />
            <button className="text-btn" type="button" onClick={() => void sync()}>
              Refresh
            </button>
          </div>
        </div>
      ) : null}

      {institutions.map((group) => {
        const total = group.rows.reduce((sum, account) => {
          const amount = Math.abs(account.currentBalanceCents);
          return sum + (classifyAccount(account.type) === "liability" ? -amount : amount);
        }, 0);
        return (
          <section key={group.key}>
            <h2 className="ios-section flex items-center justify-between gap-3">
              <span>{group.name}</span>
              <MoneyText cents={total} signed />
            </h2>
            <div className="card">
              {group.rows.map((account) => (
                <Link
                  key={account.id}
                  href={`/accounts/${account.id}`}
                  className="data-row justify-between gap-3"
                  onPointerEnter={() => warmQuery(`account:${account.id}`, `/api/accounts/${account.id}`)}
                >
                  <div className="min-w-0">
                    <div className="truncate text-[17px] font-medium">{account.name}</div>
                    {accountLine(account) ? <div className="truncate text-[13px] text-[var(--muted)]">{accountLine(account)}</div> : null}
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
                <input className="shelf-input" placeholder="Checking, Home, Car…" value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <label className="field">
                <span className="field-label">Kind</span>
                <select className="shelf-input" value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="cash">Cash / bank</option>
                  <option value="property">Home</option>
                  <option value="vehicle">Car</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="field">
                <span className="field-label">Type</span>
                <select className="shelf-input" value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="depository">Deposit</option>
                  <option value="investment">Investment</option>
                  <option value="credit">Credit card</option>
                  <option value="loan">Loan</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="field">
                <span className="field-label">Balance</span>
                <input className="shelf-input" inputMode="decimal" placeholder="0.00" value={balance} onChange={(e) => setBalance(e.target.value)} />
              </label>
              <button className="shelf-btn w-full">Add account</button>
            </div>
          </form>
        </Sheet>
      ) : null}
    </div>
    </PageShell>
  );
}

function accountLine(account: { type: string; subtype: string | null; mask: string | null }) {
  const kind = account.subtype || account.type;
  const label = kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : "";
  const mask = account.mask ? `···${account.mask}` : "";
  return [label, mask].filter(Boolean).join(" · ");
}
