import { Text, View } from "react-native";
import { holdingMeta, money } from "./format";
import { colors } from "./theme";

export type HoldingRowData = {
  institutionValueCents: number;
  quantity?: string | null;
  institutionPriceCents?: number | null;
  costBasisCents?: number | null;
  security?: { name?: string | null; ticker?: string | null } | null;
};

/** One position: the security, the shares and price, and the result against cost. */
export function HoldingRow({ holding, divided }: { holding: HoldingRowData; divided?: boolean }) {
  const meta = holdingMeta(holding);
  const gain = holding.costBasisCents == null ? null : holding.institutionValueCents - holding.costBasisCents;
  const color = gain == null || gain === 0 ? colors.ink : gain > 0 ? colors.positive : colors.danger;
  return (
    <View
      style={{
        minHeight: 52,
        paddingHorizontal: 16,
        paddingVertical: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        borderTopWidth: divided ? 1 : 0,
        borderTopColor: colors.line,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontSize: 16, color: colors.ink }}>
          {holding.security?.name || holding.security?.ticker || "Holding"}
        </Text>
        {meta ? (
          <Text numberOfLines={1} style={{ fontSize: 12, color: colors.muted }}>
            {meta}
          </Text>
        ) : null}
      </View>
      <Text style={{ fontWeight: "600", color, fontVariant: ["tabular-nums"] }}>{money(holding.institutionValueCents)}</Text>
    </View>
  );
}
