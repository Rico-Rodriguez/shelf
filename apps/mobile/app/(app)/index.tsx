import { router } from "expo-router";
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { api } from "../../src/api";
import { money, outflow } from "../../src/format";
import { Button, Card, Loading, Note, Row, Screen } from "../../src/ui";

type Dash = {
  cashFlow: { incomeCents: number; spendingCents: number; savedCents: number };
  budget: { plannedCents: number; spentCents: number; remainingCents: number };
  unreviewed: { count: number };
  accountCount: number;
  recurring: { id: string; merchantName: string; amountCents: number; nextDate: string; isIncome: boolean }[];
  transactions: { id: string; name: string; amountCents: number; date: string; pending: boolean }[];
  spending?: { name: string; cents: number }[];
};

export default function HomeScreen() {
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    void api<Dash>("/api/dashboard")
      .then((next) => {
        setData(next);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load home"));
  }, []);

  useFocusEffect(load);

  async function sample() {
    setBusy(true);
    try {
      await api("/api/demo/seed", { method: "POST" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load sample data");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Home" subtitle="This month" refresh={<Button label="Refresh" tone="quiet" onPress={load} />}>
      {error ? <Note>{error}</Note> : null}
      {!data ? <Loading /> : null}
      {data ? (
        <>
          <Card>
            <Note>Spent</Note>
            <Row title={money(data.cashFlow.spendingCents)} />
            <Row title="Income" detail={money(data.cashFlow.incomeCents)} />
            <Row title={data.cashFlow.savedCents < 0 ? "Over income" : "Saved"} detail={money(Math.abs(data.cashFlow.savedCents))} />
            <Row title="Left in the plan" detail={money(data.budget.remainingCents)} onPress={() => router.push("/(app)/budget")} />
            <Row title="To review" detail={String(data.unreviewed.count)} onPress={() => router.push("/(app)/activity")} />
          </Card>
          {(data.spending ?? []).slice(0, 5).map((row) => (
            <Row key={row.name} title={row.name} detail={money(row.cents)} />
          ))}
          {data.recurring.filter((row) => !row.isIncome).slice(0, 4).map((row) => (
            <Row key={row.id} title={row.merchantName} detail={`${outflow(row.amountCents)} · ${row.nextDate}`} onPress={() => router.push("/bills")} />
          ))}
          {data.transactions.map((tx) => (
            <Row key={tx.id} title={tx.name} detail={`${outflow(tx.amountCents)} · ${tx.date}`} onPress={() => router.push("/(app)/activity")} />
          ))}
          {data.accountCount === 0 ? <Button label={busy ? "Loading sample…" : "Load sample data"} onPress={() => void sample()} busy={busy} /> : null}
        </>
      ) : null}
    </Screen>
  );
}
