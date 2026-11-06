import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api } from "../src/api";
import { money, periodLabel, periodRange, signed } from "../src/format";
import { tapPress } from "../src/haptic";
import { Icon } from "../src/icons";
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
            label={visible.length ? `Saved · ${periodLabel(visible[0].key)} – ${periodLabel(visible[visible.length - 1].key)}` : "Saved"}
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
            {visible.map((row, index) => {
              const range = periodRange(row.key);
              return (
                <Pressable
                  key={row.key}
                  disabled={!range}
                  onPressIn={tapPress}
                  onPress={() => {
                    if (range) router.push({ pathname: "/(app)/activity", params: range });
                  }}
                  style={({ pressed }) => ({
                    minHeight: 52,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    borderTopWidth: index ? 1 : 0,
                    borderTopColor: colors.line,
                    backgroundColor: pressed ? colors.fill : "transparent",
                  })}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 15, fontWeight: "500", color: colors.ink }}>{periodLabel(row.key)}</Text>
                    <Text style={{ fontSize: 12, color: colors.muted, fontVariant: ["tabular-nums"] }}>
                      {`In ${money(row.income)} · Out ${money(row.spending)}`}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "600",
                      fontVariant: ["tabular-nums"],
                      color: row.savings < 0 ? colors.danger : row.savings > 0 ? colors.positive : colors.ink,
                    }}
                  >
                    {signed(row.savings)}
                  </Text>
                  {range ? <Icon name="chevron" size={14} color={colors.tertiary} /> : null}
                </Pressable>
              );
            })}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
