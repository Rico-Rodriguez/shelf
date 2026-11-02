import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { api } from "../src/api";
import { money, periodRange } from "../src/format";
import { Back, Card, colors, GroupedBars, Loading, Note, Screen, Segment } from "../src/ui";

type Point = { key: string; income: number; spending: number; savings: number };

const SERIES = [
  { key: "Income", color: "#1b7a62" },
  { key: "Saved", color: "#5c6570" },
  { key: "Spending", color: "#d94a2e" },
] as const;

export default function CashFlowScreen() {
  const [grain, setGrain] = useState("month");
  const [series, setSeries] = useState<Point[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSeries(null);
    const now = new Date();
    void api<{ series: Point[] }>(`/api/cash-flow?grain=${grain}&months=12&year=${now.getFullYear()}&month=${now.getMonth() + 1}`)
      .then((res) => {
        setSeries(res.series);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load cash flow"));
  }, [grain]);

  const rows = series ?? [];
  const first = rows.findIndex((row) => row.income || row.spending || row.savings);
  const visible = first === -1 ? rows.slice(-6) : rows.slice(first);
  const multiYear = new Set(visible.map((row) => row.key.slice(0, 4))).size > 1;
  const income = rows.reduce((sum, row) => sum + row.income, 0);
  const spending = rows.reduce((sum, row) => sum + row.spending, 0);
  const rate = income > 0 ? Math.round(((income - spending) / income) * 100) : null;

  return (
    <Screen title="Cash Flow" refresh={<Back />}>
      {error ? <Note>{error}</Note> : null}
      <Segment
        value={grain}
        onChange={setGrain}
        options={[
          { value: "month", label: "Monthly" },
          { value: "quarter", label: "Quarterly" },
        ]}
      />
      <Note>{`Savings rate ${rate == null ? "—" : `${rate}%`} over this range`}</Note>
      {series === null && !error ? <Loading /> : null}
      {series ? (
        <Card>
          <View style={{ padding: 12 }}>
            <GroupedBars
              series={[...SERIES]}
              points={visible.map((row) => ({
                label: axisLabel(row.key, multiYear),
                values: { Income: row.income / 100, Spending: row.spending / 100, Saved: Math.max(0, row.savings / 100) },
              }))}
              onPress={(label) => {
                const row = visible.find((item) => axisLabel(item.key, multiYear) === label);
                const range = row ? periodRange(row.key) : null;
                if (range) router.push({ pathname: "/(app)/activity", params: range });
              }}
            />
          </View>
        </Card>
      ) : null}
      {series && visible.length === 0 ? <Text style={{ color: colors.muted }}>Nothing in this range.</Text> : null}
    </Screen>
  );
}

function axisLabel(key: string, multiYear: boolean) {
  const month = /^(\d{4})-(\d{2})$/.exec(key);
  if (!month) return key.replace("-", " ");
  const short = new Date(Number(month[1]), Number(month[2]) - 1, 1).toLocaleString("en-US", { month: "short" });
  return multiYear ? `${short} ’${month[1].slice(2)}` : short;
}
