import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { api } from "../src/api";
import { money, monthLabel } from "../src/format";
import { Back, Card, colors, Facts, Hero, Loading, MonthNav, Note, Screen } from "../src/ui";

type Report = {
  year: number;
  month: number;
  incomeCents: number;
  spendingCents: number;
  usualSpentCents?: number | null;
  byCategory: { id: string; name: string; cents: number; color?: string }[];
  byMerchant?: { name: string; cents: number }[];
  netWorth: { netWorthCents: number };
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

  const categories = (data?.byCategory ?? []).filter((row) => row.cents > 0);
  const max = categories[0]?.cents ?? 1;

  return (
    <Screen title="Insights" refresh={<Back />}>
      <MonthNav year={cursor.year} month={cursor.month} label={monthLabel(cursor.year, cursor.month)} onChange={(year, month) => setCursor({ year, month })} />
      {error ? <Note>{error}</Note> : null}
      {!data && !error ? <Loading /> : null}
      {data ? (
        <>
          <Hero label="Spent" cents={data.spendingCents}>
            <Facts
              items={[
                { kicker: "Usual month", value: data.usualSpentCents == null ? "—" : money(data.usualSpentCents) },
                { kicker: "Income", value: money(data.incomeCents), color: colors.positive },
              ]}
            />
          </Hero>
          <Hero label="Net worth" cents={data.netWorth.netWorthCents} tone={data.netWorth.netWorthCents < 0 ? "bad" : undefined} />
          {categories.length ? (
            <Card>
              {categories.map((row, index) => (
                <View key={row.id} style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                    <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, color: colors.ink }}>{row.name}</Text>
                    <Text style={{ fontWeight: "600", color: colors.ink }}>{money(row.cents)}</Text>
                  </View>
                  <View style={{ height: 6, borderRadius: 99, backgroundColor: colors.fill, overflow: "hidden" }}>
                    <View style={{ width: `${Math.max(4, Math.round((row.cents / max) * 100))}%`, height: "100%", backgroundColor: colors.accent }} />
                  </View>
                </View>
              ))}
            </Card>
          ) : null}
          {(data.byMerchant ?? []).length ? (
            <Card>
              {(data.byMerchant ?? []).slice(0, 8).map((row, index) => (
                <View key={row.name} style={{ minHeight: 52, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, color: colors.ink }}>{row.name}</Text>
                  <Text style={{ fontWeight: "600" }}>{money(row.cents)}</Text>
                </View>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
