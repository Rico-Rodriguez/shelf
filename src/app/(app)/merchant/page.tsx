"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MoneyText } from "@/components/MoneyText";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageError, PageSkeleton } from "@/components/ui/PageShell";
import { useQuery } from "@/lib/use-query";

type Tx = {
  id: string;
  name: string;
  date: string;
  amountCents: number;
  pending: boolean;
  category: { name: string } | null;
};

function Merchant() {
  const params = useSearchParams();
  const name = params.get("name") ?? "";
  const { data, loading, error, reload } = useQuery<{ transactions: Tx[] }>(
    name ? `merchant:${name}` : null,
    name ? `/api/transactions?merchant=${encodeURIComponent(name)}` : null,
  );
  const rows = data?.transactions ?? null;

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
    <div className="screen">
      <Link href="/insights" className="ios-back">
        Insights
      </Link>
      <PageHeader title={name} />
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
