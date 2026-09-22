"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MoneyText } from "@/components/MoneyText";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageError, PageSkeleton } from "@/components/ui/PageShell";
import { SummaryCard } from "@/components/ui/SummaryCard";
import { api } from "@/lib/client";
import { useQuery } from "@/lib/use-query";

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
  const { data, loading, error, reload } = useQuery<{ transactions: Tx[] }>(
    name ? `merchant:${name}` : null,
    name ? `/api/transactions?merchant=${encodeURIComponent(name)}` : null,
  );
  const rows = data?.transactions ?? null;
  const [rule, setRule] = useState<Rule | null>(null);
  const [categoryName, setCategoryName] = useState<string | null>(null);

  useEffect(() => {
    if (!name) return;
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
    const months = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b));
    const usual = months.length ? Math.round(months.reduce((sum, [, cents]) => sum + cents, 0) / months.length) : null;
    const counts = new Map<string, number>();
    for (const tx of list) {
      const label = tx.category?.name;
      if (!label) continue;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    const category = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { usual, category, series: months.map(([date, cents]) => ({ date, cents })) };
  }, [rows]);

  if (!name) {
    return (
      <div className="space-y-3">
        <PageHeader title="Merchant" />
        <p className="text-[15px] text-[var(--muted)]">Open a merchant from Insights.</p>
      </div>
    );
  }
  if (!rows && loading) return <PageSkeleton title={name} rows={4} />;
  if (!rows) return <PageError title={name} message={error} onRetry={() => void reload()} />;

  return (
    <div className="space-y-5">
      <Link href="/insights" className="ios-back">
        Insights
      </Link>
      <PageHeader title={name} />
      <SummaryCard
        label="Usual month"
        cents={summary.usual ?? 0}
        empty={summary.usual == null ? "Not enough history" : undefined}
        status={summary.category ? { label: summary.category, tone: "neutral" } : null}
        points={summary.series}
        chartLabel="Spending by month"
        footer={rule ? (categoryName ? `Files as ${categoryName}` : "A rule matches this merchant") : "No rule yet"}
        detail={rule ? null : "Confirm a category and turn on Always."}
      />
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
