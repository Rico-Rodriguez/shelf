import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { api } from "../src/api";
import { money, shelfColor } from "../src/format";
import { Back, Card, colors, Hero, Loading, Note, Screen, Section, SpendMix } from "../src/ui";

type Holding = {
  institutionValueCents: number;
  security: { name?: string; ticker?: string; type?: string } | null;
  account: { name?: string } | null;
};

const TONES = ["#14181f", "#5c6570", "#1b7a62", "#8fb9ad"];

export default function InvestmentsScreen() {
  const [rows, setRows] = useState<Holding[] | null>(null);
  const [total, setTotal] = useState(0);
  const [contribution, setContribution] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ holdings: Holding[]; totalCents?: number; contributionCents?: number }>("/api/investments")
      .then((res) => {
        setRows(res.holdings);
        setTotal(res.totalCents ?? res.holdings.reduce((sum, row) => sum + row.institutionValueCents, 0));
        setContribution(res.contributionCents ?? 0);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load investments"));
  }, []);

  const shares = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows ?? []) {
      const key = row.security?.type || "Other";
      map.set(key, (map.get(key) ?? 0) + row.institutionValueCents);
    }
    return [...map.entries()].map(([label, cents], index) => ({ label, cents, color: TONES[index % TONES.length] }));
  }, [rows]);

  return (
    <Screen title="Investments" refresh={<Back />}>
      {error ? <Note>{error}</Note> : null}
      {rows === null && !error ? <Loading /> : null}
      {rows ? (
        <>
          <Hero
            label="Value"
            cents={total}
            shares={shares}
            footer={contribution ? `Contributions ${money(contribution)}` : undefined}
          />
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
                <Text style={{ fontWeight: "600", color: colors.ink }}>{money(row.institutionValueCents)}</Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
