"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MoneyText } from "@/components/MoneyText";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/PageShell";
import { api } from "@/lib/client";
import { formatMoney } from "@/lib/money";

type Tx = {
  id: string;
  name: string;
  date: string;
  amountCents: number;
  pending: boolean;
  category: { name: string } | null;
};

type Rule = { id: string; matchMerchant: string | null; actionCategoryId: string | null; name: string };

function Merchant() {
  const params = useSearchParams();
  const name = params.get("name") ?? "";
  const [rows, setRows] = useState<Tx[] | null>(null);
  const [rule, setRule] = useState<Rule | null>(null);
  const [categoryName, setCategoryName] = useState<string | null>(null);

  useEffect(() => {
    if (!name) {
      setRows([]);
      return;
    }
    void api<{ transactions: Tx[] }>(`/api/transactions?merchant=${encodeURIComponent(name)}`).then((res) => setRows(res.transactions));
    void api<{ rules: Rule[] }>("/api/rules")
      .then(async (res) => {
        const match = res.rules.find((item) => item.matchMerchant && name.toLowerCase().includes(item.matchMerchant.toLowerCase()));
        setRule(match ?? null);
        if (!match?.actionCategoryId) return;
        const cats = await api<{ groups: { categories: { id: string; name: string }[] }[] }>("/api/categories");
        const found = cats.groups.flatMap((group) => group.categories).find((category) => category.id === match.actionCategoryId);
        setCategoryName(found?.name ?? null);
      })
      .catch(() => undefined);
  }, [name]);

  const summary = useMemo(() => {
    const list = (rows ?? []).filter((tx) => !tx.pending && tx.amountCents > 0);
    const byMonth = new Map<string, number>();
    for (const tx of list) {
      const key = tx.date.slice(0, 7);
      byMonth.set(key, (byMonth.get(key) ?? 0) + tx.amountCents);
    }
    const months = [...byMonth.values()];
    const usual = months.length ? Math.round(months.reduce((sum, cents) => sum + cents, 0) / months.length) : null;
    const counts = new Map<string, number>();
    for (const tx of list) {
      const label = tx.category?.name;
      if (!label) continue;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    const category = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { usual, category };
  }, [rows]);

  if (!name) {
    return (
      <div className="space-y-3">
        <PageHeader title="Merchant" />
        <p className="text-[15px] text-[var(--muted)]">Open a merchant from Insights.</p>
      </div>
    );
  }
  if (!rows) return <PageSkeleton title={name} rows={4} />;

  return (
    <div className="space-y-5">
      <Link href="/insights" className="ios-back">
        Insights
      </Link>
      <PageHeader title={name} subtitle={summary.category ?? undefined} />
      <section>
        <p className="text-[13px] text-[var(--muted)]">Usual month</p>
        <p className="mt-1 text-[15px]">{summary.usual == null ? "Not enough history" : formatMoney(summary.usual)}</p>
        {rule ? (
          <p className="mt-2 text-[15px] text-[var(--muted)]">{categoryName ? `Files as ${categoryName}.` : "A rule matches this merchant."}</p>
        ) : (
          <p className="mt-2 text-[15px] text-[var(--muted)]">No rule yet. Confirm a category and turn on Always.</p>
        )}
      </section>
      <div className="card">
        {rows.map((tx) => (
          <div key={tx.id} className={`data-row justify-between gap-3 ${tx.pending ? "is-pending" : ""}`}>
            <span className="min-w-0">
              <span className="block truncate">{tx.name}</span>
              <span className="block text-[13px] text-[var(--muted)]">
                {tx.date}
                {tx.category?.name ? ` · ${tx.category.name}` : ""}
              </span>
            </span>
            <MoneyText cents={-tx.amountCents} signed />
          </div>
        ))}
        {rows.length === 0 ? <p className="data-row text-[var(--muted)]">No transactions for this merchant.</p> : null}
      </div>
    </div>
  );
}

export default function MerchantPage() {
  return (
    <Suspense fallback={<PageSkeleton title="Merchant" rows={4} />}>
      <Merchant />
    </Suspense>
  );
}
