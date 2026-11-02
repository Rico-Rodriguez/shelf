import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { api } from "../src/api";
import { money, shelfColor } from "../src/format";
import { Back, Card, colors, Facts, Hero, LoadError, Loading, Note, Screen, Section, SpendMix } from "../src/ui";

type Holding = {
  institutionValueCents: number;
  security: { name?: string; ticker?: string; type?: string } | null;
  account: { name?: string } | null;
};

type Payload = {
  holdings: Holding[];
  totalCents?: number;
  gainCents?: number | null;
  series?: { date: string; cents: number }[];
};

const TONES = ["#14181f", "#5c6570", "#1b7a62", "#8fb9ad"];

export default function InvestmentsScreen() {
  const [rows, setRows] = useState<Holding[] | null>(null);
  const [total, setTotal] = useState(0);
  const [gain, setGain] = useState<number | null>(null);
  const [series, setSeries] = useState<{ date: string; cents: number }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    return api<Payload>("/api/investments")
      .then((res) => {
        setRows(res.holdings);
        setTotal(res.totalCents ?? res.holdings.reduce((sum, row) => sum + row.institutionValueCents, 0));
        setGain(res.gainCents ?? null);
        setSeries(res.series ?? []);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load investments"));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shares = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows ?? []) {
      const key = row.security?.type || "Other";
      map.set(key, (map.get(key) ?? 0) + row.institutionValueCents);
    }
    return [...map.entries()].map(([label, cents], index) => ({ label, cents, color: TONES[index % TONES.length] }));
  }, [rows]);

  const charting = series.length > 1;

  return (
    <Screen title="Investments" refresh={<Back />} onRefresh={load}>
      {error ? <LoadError message={error} onRetry={() => void load()} /> : null}
      {rows === null && !error ? <Loading /> : null}
      {rows ? (
        <>
          <Hero
            label="Market value"
            cents={total}
            points={charting ? series : undefined}
            shares={!charting && gain == null ? shares : undefined}
          >
            {gain != null ? (
              <Facts
                items={[
                  {
                    kicker: gain >= 0 ? "Gain" : "Loss",
                    value: money(Math.abs(gain)),
                    color: gain >= 0 ? colors.positive : colors.danger,
                  },
                ]}
              />
            ) : charting ? (
              <Facts items={shares.map((share) => ({ kicker: share.label, value: money(share.cents) }))} />
            ) : null}
          </Hero>
          <Section title="Holdings" />
          <Card>
            <SpendMix rows={shares.map((share) => ({ key: share.label, cents: share.cents, color: shelfColor(share.color) }))} />
            {rows.length === 0 ? <Note>No holdings yet.</Note> : null}
            {rows.map((row, index) => (
              <View key={index} style={{ minHeight: 52, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontSize: 16, color: colors.ink }}>{row.security?.name || row.security?.ticker || "Holding"}</Text>
                  {row.account?.name ? <Text style={{ fontSize: 12, color: colors.muted }}>{row.account.name}</Text> : null}
                </View>
                <Text style={{ fontWeight: "600", color: colors.ink, fontVariant: ["tabular-nums"] }}>{money(row.institutionValueCents)}</Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
