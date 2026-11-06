import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { useCached } from "../src/cached";
import { money, monthLabel, shelfColor, shiftMonth } from "../src/format";
import { tapPress, tapSelect } from "../src/haptic";
import { useTheme } from "../src/theme";
import { Back, LedgerRow, LoadError, Loading, MonthNav, Screen, Section } from "../src/ui";

type Report = {
  year: number;
  month: number;
  incomeCents: number;
  spendingCents: number;
  byCategory: { id: string; name: string; group: string; cents: number; color?: string }[];
};
type CashFlow = { series: { key: string; income: number; spending: number }[] };
type Band = { key: string; name: string; cents: number; color: string; kept?: boolean };

const keyOf = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;
const HEIGHT = 260;
const NODE = 10;
const GAP = 6;

/** Where a month's money went: in on the left, out by group on the right, with what was kept. */
export default function MoneyFlowScreen() {
  const { palette } = useTheme();
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [open, setOpen] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const report = useCached<Report>(`/api/reports?year=${cursor.year}&month=${cursor.month}`, { keep: true, fallback: "Could not load money flow" });
  const flow = useCached<CashFlow>("/api/cash-flow?months=12", { keep: true });
  const data = report.data;

  const income = data?.incomeCents ?? 0;
  const spending = data?.spendingCents ?? 0;
  const kept = income - spending;

  // Right column: each group's spending, biggest first, then what was kept.
  const bands = useMemo<Band[]>(() => {
    const byGroup = new Map<string, Band>();
    for (const row of data?.byCategory ?? []) {
      if (row.cents <= 0) continue;
      const name = row.group || "Other";
      const band = byGroup.get(name) ?? { key: name, name, cents: 0, color: shelfColor(row.color) };
      band.cents += row.cents;
      byGroup.set(name, band);
    }
    const out = [...byGroup.values()].sort((a, b) => b.cents - a.cents);
    if (kept > 0) out.push({ key: "kept", name: "Kept", cents: kept, color: palette.positive, kept: true });
    return out;
  }, [data, kept, palette.positive]);

  // Left column: income, plus savings when the month spent more than came in.
  const sources = useMemo<Band[]>(() => {
    const out: Band[] = [];
    if (income > 0) out.push({ key: "in", name: "Income", cents: income, color: palette.ink });
    if (kept < 0) out.push({ key: "savings", name: "From savings", cents: -kept, color: palette.warn });
    return out;
  }, [income, kept, palette.ink, palette.warn]);

  const diagram = useMemo(() => {
    const total = bands.reduce((sum, band) => sum + band.cents, 0);
    if (width <= 0 || total <= 0) return null;
    const leftX = 0;
    const rightX = Math.round(width * 0.46);
    const usable = HEIGHT - GAP * Math.max(0, bands.length - 1);
    const scale = usable / total;
    // Right nodes, stacked with gaps.
    let y = 0;
    const right = bands.map((band) => {
      const h = Math.max(2, band.cents * scale);
      const node = { ...band, y, h };
      y += h + GAP;
      return node;
    });
    // Left nodes, stacked without gaps so the ribbons leave them in order.
    const leftScale = HEIGHT / Math.max(1, sources.reduce((sum, src) => sum + src.cents, 0));
    let ly = 0;
    const left = sources.map((src) => {
      const h = src.cents * leftScale;
      const node = { ...src, y: ly, h };
      ly += h;
      return node;
    });
    let cursorY = 0;
    const ribbons = right.map((node) => {
      const h = node.cents * leftScale;
      const y0 = cursorY;
      cursorY += h;
      const x0 = leftX + NODE;
      const x1 = rightX;
      const mid = (x0 + x1) / 2;
      const d = `M ${x0} ${y0} C ${mid} ${y0}, ${mid} ${node.y}, ${x1} ${node.y} L ${x1} ${node.y + node.h} C ${mid} ${node.y + node.h}, ${mid} ${y0 + h}, ${x0} ${y0 + h} Z`;
      return { key: node.key, d, color: node.color };
    });
    return { left, right, ribbons, rightX };
  }, [bands, sources, width]);

  const months = useMemo(() => {
    const byKey = new Map((flow.data?.series ?? []).map((row) => [row.key, row]));
    return Array.from({ length: 12 }, (_, i) => {
      const m = shiftMonth(now.getFullYear(), now.getMonth() + 1, i - 11);
      const row = byKey.get(keyOf(m.year, m.month));
      return { ...m, key: keyOf(m.year, m.month), income: row?.income ?? 0, spending: row?.spending ?? 0 };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.data]);
  const top = Math.max(1, ...months.map((m) => Math.max(m.income, m.spending)));

  const openGroup = open ? (data?.byCategory ?? []).filter((row) => (row.group || "Other") === open && row.cents > 0).sort((a, b) => b.cents - a.cents) : [];
  const rate = income > 0 ? Math.round((kept / income) * 100) : null;

  return (
    <Screen title="Money flow" refresh={<Back />} onRefresh={() => Promise.all([report.reload(), flow.reload()])}>
      <MonthNav
        year={cursor.year}
        month={cursor.month}
        label={monthLabel(cursor.year, cursor.month)}
        onChange={(year, month) => {
          setOpen(null);
          setCursor({ year, month });
        }}
      />
      {report.error ? <LoadError message={report.error} onRetry={() => void report.reload()} /> : null}
      {report.loading ? <Loading /> : null}

      {data ? (
        <>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Figure label="In" value={money(income)} />
            <Figure label="Out" value={money(spending)} />
            <Figure
              label={kept >= 0 ? "Kept" : "Over"}
              value={money(Math.abs(kept))}
              detail={rate != null && kept > 0 ? `${rate}% of income` : undefined}
              tone={kept >= 0 ? palette.positive : palette.warn}
            />
          </View>

          <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ height: HEIGHT }}>
            {diagram ? (
              <>
                <Svg width={width} height={HEIGHT}>
                  {diagram.ribbons.map((ribbon) => (
                    <Path key={ribbon.key} d={ribbon.d} fill={ribbon.color} fillOpacity={open && open !== ribbon.key ? 0.08 : 0.22} />
                  ))}
                  {diagram.left.map((node) => (
                    <Rect key={node.key} x={0} y={node.y} width={NODE} height={node.h} rx={3} fill={node.color} />
                  ))}
                  {diagram.right.map((node) => (
                    <Rect key={node.key} x={diagram.rightX} y={node.y} width={NODE} height={node.h} rx={3} fill={node.color} fillOpacity={open && open !== node.key ? 0.35 : 1} />
                  ))}
                </Svg>
                {diagram.right.map((node) => (
                  <Pressable
                    key={node.key}
                    accessibilityRole="button"
                    accessibilityLabel={`${node.name}, ${money(node.cents)}`}
                    disabled={node.kept}
                    onPress={() => {
                      tapSelect();
                      setOpen((current) => (current === node.key ? null : node.key));
                    }}
                    style={{
                      position: "absolute",
                      left: diagram.rightX + NODE + 8,
                      right: 0,
                      top: node.y + node.h / 2 - 18,
                      height: 36,
                      justifyContent: "center",
                    }}
                  >
                    {node.h + GAP >= 16 ? (
                      <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", color: palette.ink }}>
                        {node.name} <Text style={{ fontWeight: "500", color: palette.muted }}>{money(node.cents)}</Text>
                      </Text>
                    ) : null}
                  </Pressable>
                ))}
              </>
            ) : (
              <Text style={{ fontSize: 15, color: palette.muted }}>Nothing came in or went out this month.</Text>
            )}
          </View>

          {open ? (
            <View style={{ gap: 4 }}>
              <Section title={open} action="All groups" onAction={() => setOpen(null)} />
              {openGroup.map((row, index) => (
                <LedgerRow
                  key={row.id || row.name}
                  bare
                  divided={index > 0}
                  name={row.name}
                  color={row.color}
                  amount={money(row.cents)}
                  onPress={
                    row.id
                      ? () => {
                          tapPress();
                          router.push({ pathname: "/category", params: { id: row.id, name: row.name, year: String(cursor.year), month: String(cursor.month) } });
                        }
                      : undefined
                  }
                />
              ))}
            </View>
          ) : (
            <View style={{ gap: 4 }}>
              <Section title="Groups" />
              {bands
                .filter((band) => !band.kept)
                .map((band, index) => (
                  <LedgerRow
                    key={band.key}
                    bare
                    divided={index > 0}
                    name={band.name}
                    color={band.color}
                    meta={spending > 0 ? `${Math.round((band.cents / spending) * 100)}% of spending` : undefined}
                    amount={money(band.cents)}
                    onPress={() => {
                      tapSelect();
                      setOpen(band.key);
                    }}
                  />
                ))}
            </View>
          )}
        </>
      ) : null}

      <View style={{ gap: 10 }}>
        <Section title="Last 12 months" />
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, height: 110 }}>
          {months.map((m) => {
            const on = m.year === cursor.year && m.month === cursor.month;
            return (
              <Pressable
                key={m.key}
                accessibilityRole="button"
                accessibilityLabel={`${monthLabel(m.year, m.month)}: in ${money(m.income)}, out ${money(m.spending)}`}
                onPress={() => {
                  tapSelect();
                  setOpen(null);
                  setCursor({ year: m.year, month: m.month });
                }}
                style={{ flex: 1, alignItems: "center", gap: 4 }}
              >
                <View style={{ height: 90, flexDirection: "row", alignItems: "flex-end", gap: 2 }}>
                  <View style={{ width: 5, height: Math.max(2, (m.income / top) * 90), borderRadius: 2, backgroundColor: on ? palette.positive : `${palette.positive}55` }} />
                  <View style={{ width: 5, height: Math.max(2, (m.spending / top) * 90), borderRadius: 2, backgroundColor: on ? palette.ink : palette.tertiary }} />
                </View>
                <Text style={{ fontSize: 10, fontWeight: on ? "700" : "500", color: on ? palette.ink : palette.muted }}>
                  {new Date(m.year, m.month - 1, 1).toLocaleDateString("en-US", { month: "narrow" })}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={{ flexDirection: "row", gap: 16 }}>
          <Legend color={palette.positive} label="In" />
          <Legend color={palette.ink} label="Out" />
        </View>
      </View>
    </Screen>
  );
}

function Figure({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ flex: 1, padding: 12, gap: 2, borderRadius: 14, borderCurve: "continuous", backgroundColor: palette.card }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: palette.muted }}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontSize: 18, fontWeight: "700", color: tone ?? palette.ink, letterSpacing: -0.4, fontVariant: ["tabular-nums"] }}>
        {value}
      </Text>
      {detail ? <Text style={{ fontSize: 12, color: palette.muted }}>{detail}</Text> : null}
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ fontSize: 12, color: palette.muted }}>{label}</Text>
    </View>
  );
}
