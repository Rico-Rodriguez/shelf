import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { api } from "./api";
import { money } from "./format";
import { tapSuccess } from "./haptic";
import { useReduceMotion, useTheme } from "./theme";
import { Button, Field, Note, Sheet } from "./ui";

export type BudgetRow = {
  category: { id: string; name: string };
  group: { color: string } | null;
  plannedCents: number;
  spentCents: number;
  usualCents?: number | null;
};

export const budgetPath = (year: number, month: number) => `/api/budget?year=${year}&month=${month}`;

/** Six months of spending as bars; tap one to pick it. */
export function MonthBars({
  months,
  picked,
  onPick,
}: {
  months: { year: number; month: number; key: string; cents: number; current: boolean }[];
  picked: { year: number; month: number };
  onPick: (m: { year: number; month: number }) => void;
}) {
  const { palette } = useTheme();
  const reduceMotion = useReduceMotion();
  const grow = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const top = Math.max(1, ...months.map((m) => m.cents));
  const signature = months.map((m) => m.cents).join(",");
  useEffect(() => {
    if (reduceMotion) {
      grow.setValue(1);
      return;
    }
    grow.setValue(0);
    Animated.spring(grow, { toValue: 1, useNativeDriver: true, stiffness: 160, damping: 18, mass: 0.9 }).start();
  }, [signature, reduceMotion, grow]);
  const track = 96;
  return (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-end" }}>
      {months.map((m) => {
        const on = m.year === picked.year && m.month === picked.month;
        const h = Math.max(6, (m.cents / top) * track);
        return (
          <Pressable
            key={m.key}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${new Date(m.year, m.month - 1, 1).toLocaleDateString("en-US", { month: "long" })}, ${money(m.cents)}`}
            onPress={() => onPick(m)}
            style={{ flex: 1, alignItems: "center", gap: 6 }}
          >
            <View style={{ height: track, width: "100%", justifyContent: "flex-end" }}>
              <Animated.View
                style={{
                  height: h,
                  borderRadius: 8,
                  borderCurve: "continuous",
                  backgroundColor: on ? palette.positive : palette.fill,
                  transform: [{ translateY: grow.interpolate({ inputRange: [0, 1], outputRange: [h, 0] }) }, { scaleY: grow.interpolate({ inputRange: [0, 1], outputRange: [0.01, 1] }) }],
                }}
              />
            </View>
            <Text style={{ fontSize: 12, fontWeight: on ? "700" : "600", color: on ? palette.positive : palette.muted }}>
              {new Date(m.year, m.month - 1, 1).toLocaleDateString("en-US", { month: "short" })}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Set or clear a monthly limit for one category. */
export function LimitSheet({ row, year, month, onClose, onSaved }: { row: Pick<BudgetRow, "category" | "plannedCents" | "spentCents">; year: number; month: number; onClose: () => void; onSaved: () => void }) {
  const { palette } = useTheme();
  const [value, setValue] = useState(row.plannedCents > 0 ? String(Math.round(row.plannedCents / 100)) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cents = Math.round(Number(value.replace(/[^0-9.]/g, "")) * 100);

  async function save(next: number) {
    setBusy(true);
    setError(null);
    try {
      await api("/api/budget", { method: "PUT", body: JSON.stringify({ year, month, items: [{ categoryId: row.category.id, plannedCents: next }] }) });
      tapSuccess();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the limit");
      setBusy(false);
    }
  }

  return (
    <Sheet title={row.category.name} subtitle={`Spent ${money(row.spentCents)} so far`} onClose={onClose} fit>
      <View style={{ gap: 14 }}>
        <Text style={{ fontSize: 15, lineHeight: 21, color: palette.muted }}>
          A limit adds a thin bar to this category that turns orange near the end. It carries into next month.
        </Text>
        <Field label="Monthly limit" value={value} onChangeText={setValue} keyboardType="decimal-pad" placeholder="$0" />
        {error ? <Note tone="danger">{error}</Note> : null}
        <Button label="Save limit" busy={busy} block onPress={() => (cents > 0 && !busy ? void save(cents) : undefined)} />
        {row.plannedCents > 0 ? <Button label="Remove limit" tone="quiet" block onPress={() => (!busy ? void save(0) : undefined)} /> : null}
      </View>
    </Sheet>
  );
}

