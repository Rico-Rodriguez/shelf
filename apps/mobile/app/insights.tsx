import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { useCached } from "../src/cached";
import { money, monthLabel } from "../src/format";
import { tapPress } from "../src/haptic";
import { useTheme } from "../src/theme";
import { Back, LedgerRow, LoadError, Loading, MonthNav, Screen } from "../src/ui";

type Report = {
  year: number;
  month: number;
  spendingCents: number;
  byMerchant?: { name: string; cents: number }[];
};

/** Where the money went, by merchant, one month at a time. */
export default function MerchantsScreen() {
  const now = new Date();
  const { palette } = useTheme();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const { data, error, loading, reload } = useCached<Report>(`/api/reports?year=${cursor.year}&month=${cursor.month}`, {
    keep: true,
    fallback: "Could not load merchants",
  });
  const rows = data?.byMerchant ?? [];
  const stale = data && (data.year !== cursor.year || data.month !== cursor.month);

  return (
    <Screen title="Merchants" refresh={<Back />} onRefresh={reload}>
      <MonthNav year={cursor.year} month={cursor.month} label={monthLabel(cursor.year, cursor.month)} onChange={(year, month) => setCursor({ year, month })} />
      {error ? <LoadError message={error} onRetry={() => void reload()} /> : null}
      {loading ? <Loading /> : null}
      {data ? (
        <View style={{ opacity: stale ? 0.5 : 1 }}>
          {rows.length === 0 ? (
            <Text style={{ fontSize: 15, color: palette.muted, lineHeight: 21 }}>Nothing spent this month.</Text>
          ) : (
            rows.map((row, index) => {
              const share = data.spendingCents > 0 ? Math.round((row.cents / data.spendingCents) * 100) : 0;
              return (
                <LedgerRow
                  key={row.name}
                  bare
                  divided={index > 0}
                  name={row.name}
                  meta={share ? `${share}% of the month` : undefined}
                  amount={money(row.cents)}
                  onPress={() => {
                    tapPress();
                    router.push({ pathname: "/merchant", params: { name: row.name } });
                  }}
                />
              );
            })
          )}
        </View>
      ) : null}
    </Screen>
  );
}
