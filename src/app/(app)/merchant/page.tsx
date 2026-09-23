"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useConfirmFlash } from "@/components/ConfirmFlash";
import { MoneyText } from "@/components/MoneyText";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageError, PageSkeleton } from "@/components/ui/PageShell";
import { SummaryCard } from "@/components/ui/SummaryCard";
import { api } from "@/lib/client";
import { merchantMatchKey } from "@/lib/plan";
import { useQuery } from "@/lib/use-query";

type Tx = {
  id: string;
  name: string;
  date: string;
  amountCents: number;
  pending: boolean;
  category: { id: string; name: string } | null;
};

type Rule = { id: string; matchMerchant: string | null; actionCategoryId: string | null; name: string };
type CatGroups = { groups: { categories: { id: string; name: string }[] }[] };

function Merchant() {
  const params = useSearchParams();
  const name = params.get("name") ?? "";
  const { data, loading, error, reload } = useQuery<{ transactions: Tx[] }>(
    name ? `merchant:${name}` : null,
    name ? `/api/transactions?merchant=${encodeURIComponent(name)}` : null,
  );
  const { data: categoryData } = useQuery<CatGroups>(name ? "categories" : null, name ? "/api/categories" : null);
  const rows = data?.transactions ?? null;
  const [rule, setRule] = useState<Rule | null>(null);
  const { flash, run } = useConfirmFlash();

  useEffect(() => {
    if (!name) return;
    void api<{ rules: Rule[] }>("/api/rules")
      .then((res) => {
        const match = res.rules.find((item) => item.matchMerchant && name.toLowerCase().includes(item.matchMerchant.toLowerCase()));
        setRule(match ?? null);
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
    const counts = new Map<string, { name: string; n: number }>();
    for (const tx of list) {
      const id = tx.category?.id;
      const label = tx.category?.name;
      if (!id || !label) continue;
      const current = counts.get(id) ?? { name: label, n: 0 };
      current.n += 1;
      counts.set(id, current);
    }
    const top = [...counts.entries()].sort((a, b) => b[1].n - a[1].n)[0];
    return {
      usual,
      category: top?.[1].name ?? null,
      categoryId: top?.[0] ?? null,
      series: months.map(([date, cents]) => ({ date, cents })),
    };
  }, [rows]);

  const categoryName = useMemo(() => {
    if (!rule?.actionCategoryId || !categoryData) return null;
    return categoryData.groups.flatMap((group) => group.categories).find((category) => category.id === rule.actionCategoryId)?.name ?? null;
  }, [rule, categoryData]);

  async function alwaysFile() {
    if (!summary.categoryId || !summary.category) return;
    const created = await api<{ id: string }>("/api/rules", {
      method: "POST",
      body: JSON.stringify({
        name,
        matchMerchant: merchantMatchKey(name),
        actionCategoryId: summary.categoryId,
        applyUnreviewed: true,
      }),
    });
    setRule({ id: created.id, matchMerchant: merchantMatchKey(name), actionCategoryId: summary.categoryId, name });
  }

  if (!name) {
    return (
      <div className="screen">
        <PageHeader title="Merchant" />
        <EmptyState title="Open a merchant from Insights" />
      </div>
    );
  }
  if (!rows && loading) return <PageSkeleton title={name} rows={4} />;
  if (!rows) return <PageError title={name} message={error} onRetry={() => void reload()} />;

  return (
    <div className="screen">
      {flash}
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
        footer={rule ? (categoryName ? `Files as ${categoryName}` : "A rule matches this merchant") : summary.category ? null : "No rule yet"}
      />
      {!rule && summary.category ? (
        <button className="shelf-btn" type="button" onClick={() => void run(alwaysFile)}>
          Always file as {summary.category}
        </button>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState title="No transactions for this merchant" />
      ) : (
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
        </div>
      )}
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
