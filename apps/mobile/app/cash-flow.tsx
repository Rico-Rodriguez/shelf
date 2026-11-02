import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Text } from "react-native";
import { api } from "../src/api";
import { money, periodRange } from "../src/format";
import { Back, Card, colors, Facts, Hero, LoadError, Loading, Screen, Section, Segment } from "../src/ui";

type Point = { key: string; income: number; spending: number; savings: number };

export default function CashFlowScreen() {
  const [grain, setGrain] = useState("month");
  const [series, setSeries] = useState<Point[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const now = new Date();
    return api<{ series: Point[] }>(`/api/cash-flow?grain=${grain}&months=12&year=${now.getFullYear()}&month=${now.getMonth() + 1}`)
      .then((res) => {
        setSeries(res.series);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load cash flow"));
  }, [grain]);

  useEffect(() => {
    setSeries(null);
    void load();
  }, [load]);

  const rows = series ?? [];
  const first = rows.findIndex((row) => row.income || row.spending || row.savings);
  const visible = first === -1 ? rows.slice(-6) : rows.slice(first);
  const income = rows.reduce((sum, row) => sum + row.income, 0);
  const spending = rows.reduce((sum, row) => sum + row.spending, 0);
  const savings = income - spending;
  const rate = income > 0 ? Math.round((savings / income) * 100) : null;
  const points = visible
    .map((row) => {
      const range = periodRange(row.key);
      return range ? { date: range.end, cents: row.savings } : null;
    })
    .filter((point): point is { date: string; cents: number } => Boolean(point));

  return (
    <Screen title="Cash Flow" refresh={<Back />} onRefresh={load}>
      {error ? <LoadError message={error} onRetry={() => void load()} /> : null}
      <Segment
        value={grain}
        onChange={setGrain}
        options={[
          { value: "month", label: "Monthly" },
          { value: "quarter", label: "Quarterly" },
        ]}
      />
      {series === null && !error ? <Loading /> : null}
      {series ? (
        <>
          <Hero
            label="Saved"
            cents={savings}
            signed
            tone={savings < 0 ? "bad" : savings > 0 ? "good" : undefined}
            points={points.length > 1 ? points : undefined}
          >
            <Facts
              items={[
                { kicker: "Income", value: money(income) },
                { kicker: "Spent", value: money(spending) },
                { kicker: "Savings rate", value: rate == null ? "—" : `${rate}%` },
              ]}
            />
          </Hero>
          <Section title="Periods" />
          <Card>
            {visible.length === 0 ? <Text style={{ color: colors.muted, padding: 16 }}>Nothing in this range.</Text> : null}
            {visible.map((row) => {
              const range = periodRange(row.key);
              return (
                <Text
                  key={row.key}
                  onPress={() => {
                    if (range) router.push({ pathname: "/(app)/activity", params: range });
                  }}
                  style={{ minHeight: 48, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: colors.ink, borderTopWidth: 1, borderTopColor: colors.line }}
                >
                  {`${row.key}  ${row.savings < 0 ? "-" : ""}${money(Math.abs(row.savings))}`}
                </Text>
              );
            })}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
