"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MoneyText } from "@/components/MoneyText";
import { PageHeader } from "@/components/ui/PageHeader";
import { Segment } from "@/components/ui/Segment";
import { api } from "@/lib/client";
import { addDays, todayISO } from "@/lib/dates";
import CashFlowPage from "../cash-flow/page";
import ReportsPage from "../reports/page";
import InvestmentsPage from "../investments/page";

type Rec = { amountCents: number; nextDate: string; isIncome: boolean; isActive: boolean };
type Account = { type: string; currentBalanceCents: number; isHidden: boolean };

function Insights() {
  const params = useSearchParams();
  const router = useRouter();
  const raw = params.get("tab") || "flow";
  const tab = raw === "holdings" ? "holdings" : raw === "month" || raw === "worth" || raw === "spend" ? "month" : "flow";
  const [forecast, setForecast] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      api<{ recurrences: Rec[] }>("/api/recurring"),
      api<{ accounts: Account[] }>("/api/accounts"),
    ])
      .then(([bills, accounts]) => {
        const until = addDays(todayISO(), 30);
        const due = bills.recurrences
          .filter((row) => row.isActive && !row.isIncome && row.nextDate <= until)
          .reduce((sum, row) => sum + row.amountCents, 0);
        const cash = accounts.accounts
          .filter((account) => !account.isHidden && (account.type === "depository" || account.type === "cash"))
          .reduce((sum, account) => sum + account.currentBalanceCents, 0);
        setForecast(
          `Next 30 days: ${format(due)} in bills. ${format(cash)} in cash accounts.${cash < due ? " Cash is short of those bills." : " Cash covers those bills."}`,
        );
      })
      .catch(() => setForecast(null));
  }, []);

  return (
    <div className="space-y-4">
      <PageHeader title="Insights" subtitle="One place for cash flow, this month’s spending, net worth, and holdings." />
      {forecast ? <p className="story-line">{forecast}</p> : null}
      <Segment
        value={tab}
        onChange={(value) => router.replace(`/insights?tab=${value}`, { scroll: false })}
        options={[
          { value: "flow", label: "Cash flow" },
          { value: "month", label: "This month" },
          { value: "holdings", label: "Holdings" },
        ]}
      />
      <div className="insights-embed">
        {tab === "flow" ? <CashFlowPage /> : null}
        {tab === "month" ? <ReportsPage /> : null}
        {tab === "holdings" ? <InvestmentsPage /> : null}
      </div>
    </div>
  );
}

function format(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default function InsightsPage() {
  return (
    <Suspense fallback={<p className="text-[var(--muted)]">Loading…</p>}>
      <Insights />
    </Suspense>
  );
}
