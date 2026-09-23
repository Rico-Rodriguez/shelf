import { useEffect, useState } from "react";
import { api } from "../src/api";
import { money } from "../src/format";
import { Back, Loading, Note, Row, Screen } from "../src/ui";

type Point = { key: string; income: number; spending: number; savings: number };

export default function CashFlowScreen() {
  const [series, setSeries] = useState<Point[]>([]);
  const [merchants, setMerchants] = useState<{ name: string; cents: number }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ series: Point[]; byMerchant: { name: string; cents: number }[] }>("/api/cash-flow")
      .then((res) => {
        setSeries(res.series);
        setMerchants(res.byMerchant ?? []);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load cash flow"));
  }, []);

  return (
    <Screen title="Cash flow" subtitle="The last year, month by month" refresh={<Back />}>
      {error ? <Note>{error}</Note> : null}
      {!series.length && !error ? <Loading /> : null}
      {series.map((point) => (
        <Row key={point.key} title={point.key} detail={`${money(point.income)} in · ${money(point.spending)} out`} />
      ))}
      {merchants.slice(0, 8).map((row) => (
        <Row key={row.name} title={row.name} detail={money(row.cents)} />
      ))}
    </Screen>
  );
}
