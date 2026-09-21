"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { MoneyText } from "@/components/MoneyText";
import { api } from "@/lib/client";

type Account = {
  id: string;
  name: string;
  type: string;
  currentBalanceCents: number;
  includeInNetWorth: boolean;
  isHidden: boolean;
  liabilityJson: string | null;
};

export default function AccountDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [acct, setAcct] = useState<Account | null>(null);
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");

  useEffect(() => {
    void api<{ accounts: Account[] }>("/api/accounts").then((res) => {
      const found = res.accounts.find((a) => a.id === id);
      if (found) {
        setAcct(found);
        setName(found.name);
        setBalance((found.currentBalanceCents / 100).toFixed(2));
      }
    });
  }, [id]);

  if (!acct) return <p>Looking in the drawer…</p>;

  let liability: Record<string, unknown> | null = null;
  try {
    liability = acct.liabilityJson ? JSON.parse(acct.liabilityJson) : null;
  } catch {
    liability = null;
  }

  async function save() {
    await api(`/api/accounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name,
        currentBalance: Number(balance),
        includeInNetWorth: acct!.includeInNetWorth,
        isHidden: acct!.isHidden,
      }),
    });
    window.location.href = "/accounts";
  }

  async function remove() {
    await api(`/api/accounts/${id}`, { method: "DELETE" });
    window.location.href = "/accounts";
  }

  return (
    <div className="space-y-4">
      <Link href="/accounts" className="text-sm underline">
        ← Back to jars
      </Link>
      <h1 className="pixel-title text-3xl">{acct.name}</h1>
      <div className="pixel-panel max-w-lg space-y-3 p-4">
        <label className="block text-sm">
          Name
          <input className="pixel-input mt-1" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block text-sm">
          Balance
          <input className="pixel-input mt-1" value={balance} onChange={(e) => setBalance(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={acct.includeInNetWorth}
            onChange={(e) => setAcct({ ...acct, includeInNetWorth: e.target.checked })}
          />
          Include in net worth
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={acct.isHidden} onChange={(e) => setAcct({ ...acct, isHidden: e.target.checked })} />
          Hide this jar
        </label>
        <div className="flex gap-2">
          <button className="pixel-btn" type="button" onClick={save}>
            Save
          </button>
          <button className="pixel-btn danger" type="button" onClick={remove}>
            Remove
          </button>
        </div>
      </div>
      {liability ? (
        <div className="pixel-panel p-4">
          <h2 className="pixel-title mb-2">Liability details</h2>
          <pre className="overflow-auto text-xs">{JSON.stringify(liability, null, 2)}</pre>
        </div>
      ) : (
        <p className="text-sm text-ink-soft">
          Current balance <MoneyText cents={acct.currentBalanceCents} />
        </p>
      )}
    </div>
  );
}
