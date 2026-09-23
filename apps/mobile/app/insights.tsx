import { useEffect, useState } from "react";
import { api } from "../src/api";
import { money, monthLabel, shiftMonth } from "../src/format";
import { Back, Button, Loading, Note, Row, Screen } from "../src/ui";

type Report = {
  year: number;
  month: number;
  incomeCents: number;
  spendingCents: number;
  usualSpentCents?: number | null;
  byCategory: { id: string; name: string; cents: number }[];
  byMerchant?: { name: string; cents: number }[];
  netWorth: { netWorthCents: number };
  snapshots: { date: string; netWorthCents: number }[];
};

export default function InsightsScreen() {
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<Report>(`/api/reports?year=${cursor.year}&month=${cursor.month}`)
      .then((next) => {
        setData(next);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load insights"));
  }, [cursor]);

  const latest = data?.snapshots.at(-1);
  return (
    <Screen title="Insights" subtitle={monthLabel(cursor.year, cursor.month)} refresh={<Back />}>
      <Button label="Previous" tone="quiet" onPress={() => setCursor(shiftMonth(cursor.year, cursor.month, -1))} />
      <Button label="Next" tone="quiet" onPress={() => setCursor(shiftMonth(cursor.year, cursor.month, 1))} />
      {error ? <Note>{error}</Note> : null}
      {!data ? <Loading /> : null}
      {data ? (
        <>
          <Row title="Spent" detail={money(data.spendingCents)} />
          <Row title="Usual month" detail={data.usualSpentCents == null ? "—" : money(data.usualSpentCents)} />
          <Row title="Income" detail={money(data.incomeCents)} />
          <Row title="Net worth" detail={money(data.netWorth.netWorthCents)} />
          {latest ? <Row title={latest.date} detail={money(latest.netWorthCents)} /> : null}
          {data.byCategory.slice(0, 8).map((row) => (
            <Row key={row.id} title={row.name} detail={money(row.cents)} />
          ))}
          {(data.byMerchant ?? []).map((row) => (
            <Row key={row.name} title={row.name} detail={money(row.cents)} />
          ))}
        </>
      ) : null}
    </Screen>
  );
}
