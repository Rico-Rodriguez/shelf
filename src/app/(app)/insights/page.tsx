"use client";

import { useEffect, useState } from "react";
import { CashFlowPanel } from "@/components/insights/CashFlowPanel";
import { HoldingsPanel } from "@/components/insights/HoldingsPanel";
import { MonthPanel } from "@/components/insights/MonthPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/client";
import { addDays, todayISO } from "@/lib/dates";

type Rec = { amountCents: number; nextDate: string; isIncome: boolean; isActive: boolean };
type Account = { type: string; currentBalanceCents: number; isHidden: boolean };

export default function InsightsPage() {
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
          cash < due
            ? `Next 30 days: ${format(due)} in bills. Cash is short of those bills.`
            : `Next 30 days: ${format(due)} in bills. Cash covers those bills.`,
        );
      })
      .catch(() => setForecast(null));
  }, []);

  useEffect(() => {
    const id = window.location.hash.replace("#", "");
    if (!id) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      const node = document.getElementById(id);
      tries += 1;
      if (node) {
        node.scrollIntoView();
        window.clearInterval(timer);
      } else if (tries > 24) {
        window.clearInterval(timer);
      }
    }, 150);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="space-y-10">
      <PageHeader title="Insights" subtitle={forecast ?? "Cash flow, this month, and holdings."} />
      <CashFlowPanel />
      <MonthPanel />
      <HoldingsPanel />
    </div>
  );
}

function format(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
