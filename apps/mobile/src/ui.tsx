import { router } from "expo-router";
import { ReactNode, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { flowMoney, money, shiftMonth } from "./format";
import { Icon, MerchantMark } from "./icons";

export const colors = {
  bg: "#f3f5f7",
  card: "#ffffff",
  fill: "#e8ecf0",
  fillStrong: "#d5dbe3",
  ink: "#14181f",
  accentInk: "#0f5241",
  muted: "#5c6570",
  tertiary: "#8b939e",
  line: "rgba(20, 24, 31, 0.08)",
  lineStrong: "rgba(20, 24, 31, 0.14)",
  positive: "#1b7a62",
  danger: "#d94a2e",
  accent: "#1b7a62",
  accentSoft: "rgba(27, 122, 98, 0.12)",
  warn: "#c47a1a",
};

export function Back() {
  return (
    <Pressable onPress={() => router.back()} hitSlop={8}>
      <Text style={styles.back}>Back</Text>
    </Pressable>
  );
}

export function Screen({
  title,
  subtitle,
  children,
  footer,
  refresh,
  action,
  framed = false,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  refresh?: ReactNode;
  action?: ReactNode;
  framed?: boolean;
}) {
  const body = (
    <>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {title ? (
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            {action}
            {refresh}
          </View>
        ) : null}
        {children}
      </ScrollView>
      {footer}
    </>
  );
  if (framed) return <View style={styles.safe}>{body}</View>;
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {body}
    </SafeAreaView>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function Field({
  label,
  value,
  onChangeText,
  secureTextEntry,
  placeholder,
  keyboardType,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "email-address" | "number-pad" | "decimal-pad";
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        placeholder={placeholder}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCapitalize="none"
        style={[styles.input, multiline ? styles.multiline : null]}
        placeholderTextColor={colors.tertiary}
      />
    </View>
  );
}

export function Button({
  label,
  onPress,
  busy,
  tone = "primary",
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  tone?: "primary" | "quiet" | "danger";
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={[styles.button, tone === "quiet" && styles.quiet, tone === "danger" && styles.danger]}
    >
      {busy ? (
        <ActivityIndicator color={tone === "primary" ? "#fff" : colors.ink} />
      ) : (
        <Text style={[styles.buttonText, tone !== "primary" && styles.quietText, tone === "danger" && { color: "#fff" }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Section({ title, action, onAction, trailing }: { title: string; action?: string; onAction?: () => void; trailing?: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 12 }}>
        {trailing ? <Text style={styles.sectionTrail}>{trailing}</Text> : null}
        {action && onAction ? (
          <Pressable onPress={onAction} hitSlop={8}>
            <Text style={styles.sectionAction}>{action}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function LedgerRow({
  name,
  meta,
  amount,
  amountColor,
  color,
  onPress,
  divided,
}: {
  name: string;
  meta?: string;
  amount: string;
  amountColor?: string;
  color?: string | null;
  onPress?: () => void;
  divided?: boolean;
}) {
  const body = (
    <View style={[styles.ledger, divided ? styles.divided : null]}>
      <MerchantMark name={name} color={color} />
      <View style={styles.ledgerCopy}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {name}
        </Text>
        {meta ? (
          <Text numberOfLines={1} style={styles.meta}>
            {meta}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.amount, amountColor ? { color: amountColor } : null]}>{amount}</Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? { backgroundColor: colors.fill } : null)}>
      {body}
    </Pressable>
  );
}

export function FlowAmount({ cents, size = 15 }: { cents: number; size?: number }) {
  const flow = flowMoney(cents);
  return <Text style={[styles.amount, { fontSize: size, color: flow.color }]}>{flow.text}</Text>;
}

export function Row({ title, detail, icon, onPress }: { title: string; detail?: string; icon?: string; onPress?: () => void }) {
  const body = (
    <View style={styles.row}>
      {icon ? <Icon name={icon} size={18} color={colors.ink} /> : null}
      <Text style={styles.rowTitle}>{title}</Text>
      {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
    </View>
  );
  if (!onPress) return body;
  return <Pressable onPress={onPress}>{body}</Pressable>;
}

export function MenuRow({ title, icon, onPress, divided }: { title: string; icon?: string; onPress: () => void; divided?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.ledger, divided ? styles.divided : null, pressed ? { backgroundColor: colors.fill } : null]}>
      {icon ? <Icon name={icon} size={18} color={colors.ink} /> : null}
      <Text style={[styles.rowTitle, { fontWeight: "500" }]}>{title}</Text>
      <Icon name="chevron" size={16} color={colors.tertiary} />
    </Pressable>
  );
}

export function Note({ children }: { children: string }) {
  return <Text style={styles.note}>{children}</Text>;
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.ink} />
      <Text style={styles.note}>{label}</Text>
    </View>
  );
}

export function Hero({
  label,
  cents,
  tone,
  points,
  onScrub,
  meter,
  shares,
  children,
}: {
  label: string;
  cents: number;
  tone?: "good" | "bad";
  points?: { date: string; cents: number }[];
  onScrub?: (point: { date: string; cents: number } | null) => void;
  meter?: { value: number; max: number; color?: string };
  shares?: { label: string; cents: number; color: string }[];
  children?: ReactNode;
}) {
  const shownShares = (shares ?? []).filter((share) => share.cents > 0);
  return (
    <View style={styles.hero}>
      <View pointerEvents="none" style={styles.heroWash} />
      <Text style={styles.heroLabel}>{label}</Text>
      <Text style={[styles.heroFigure, tone === "bad" ? { color: colors.danger } : null, tone === "good" ? { color: colors.positive } : null]}>
        {money(cents)}
      </Text>
      {points && points.length >= 1 ? <SpendChart points={points} onScrub={onScrub} /> : null}
      {meter ? (
        <View style={{ marginTop: 14, marginBottom: children ? 0 : 16 }}>
          <Progress value={meter.value} max={meter.max} color={meter.color} />
        </View>
      ) : null}
      {shownShares.length >= 2 ? (
        <View style={{ marginTop: 14, marginBottom: 16, gap: 8 }}>
          <View style={styles.mix}>
            {shownShares.map((share) => (
              <View key={share.label} style={{ flexGrow: share.cents, flexBasis: 4, backgroundColor: share.color }} />
            ))}
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
            {shownShares.map((share) => (
              <Text key={share.label} style={styles.kicker}>
                {share.label} {money(share.cents)}
              </Text>
            ))}
          </View>
        </View>
      ) : null}
      {children}
      {!children && shownShares.length < 2 && !meter && !(points && points.length >= 1) ? <View style={{ height: 18 }} /> : null}
    </View>
  );
}

export function Facts({ items }: { items: { kicker: string; value: string; color?: string }[] }) {
  return (
    <View style={styles.facts}>
      {items.map((item) => (
        <View key={item.kicker} style={{ flex: 1, gap: 2 }}>
          <Text style={styles.kicker}>{item.kicker}</Text>
          <Text style={[styles.factValue, item.color ? { color: item.color } : null]}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

export function SpendMix({ rows }: { rows: { key: string; cents: number; color: string }[] }) {
  const shown = rows.filter((row) => row.cents > 0);
  if (shown.length < 2) return null;
  return (
    <View style={styles.mix}>
      {shown.map((row) => (
        <View key={row.key} style={{ flexGrow: row.cents, flexBasis: 4, backgroundColor: row.color }} />
      ))}
    </View>
  );
}

export function Progress({ value, max, color = colors.positive }: { value: number; max: number; color?: string }) {
  const ratio = max <= 0 ? (value > 0 ? 1 : 0) : Math.min(1, value / max);
  const over = max > 0 ? value > max : value > 0;
  return (
    <View style={styles.track}>
      <View style={{ width: `${Math.round(ratio * 100)}%`, height: "100%", backgroundColor: over ? colors.danger : color }} />
    </View>
  );
}

export function MonthNav({ year, month, label, onChange }: { year: number; month: number; label: string; onChange: (year: number, month: number) => void }) {
  return (
    <View style={styles.monthNav}>
      <Pressable
        accessibilityLabel="Previous month"
        onPress={() => {
          const next = shiftMonth(year, month, -1);
          onChange(next.year, next.month);
        }}
        style={styles.monthBtn}
        hitSlop={8}
      >
        <Text style={styles.monthChevron}>‹</Text>
      </Pressable>
      <Text style={styles.monthLabel}>{label}</Text>
      <Pressable
        accessibilityLabel="Next month"
        onPress={() => {
          const next = shiftMonth(year, month, 1);
          onChange(next.year, next.month);
        }}
        style={styles.monthBtn}
        hitSlop={8}
      >
        <Text style={styles.monthChevron}>›</Text>
      </Pressable>
    </View>
  );
}

export function ReviewBanner({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.banner, pressed ? { backgroundColor: colors.fill } : null]}>
      <Text style={styles.bannerText}>{label}</Text>
      <Icon name="chevron" size={18} color={colors.ink} />
    </Pressable>
  );
}

export function SearchField({ value, onChangeText, placeholder }: { value: string; onChangeText: (value: string) => void; placeholder: string }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.tertiary}
      autoCapitalize="none"
      autoCorrect={false}
      style={styles.search}
    />
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetWrap}>
        <Pressable style={styles.sheetBackdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle} numberOfLines={1}>
              {title}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.sectionAction}>Done</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 12 }}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function SpendChart({
  points,
  onScrub,
}: {
  points: { date: string; cents: number }[];
  onScrub?: (point: { date: string; cents: number } | null) => void;
}) {
  const series = points.length > 0 && points[0].cents !== 0 ? [{ date: points[0].date, cents: 0 }, ...points] : points;
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  if (series.length < 2) return null;
  const max = Math.max(...series.map((point) => point.cents), 1);

  function pick(x: number) {
    if (!width || !onScrub) return;
    const index = Math.round(Math.min(1, Math.max(0, x / width)) * (series.length - 1));
    setActive(index);
    onScrub(series[index] ?? null);
  }

  return (
    <View
      style={styles.chart}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => Boolean(onScrub)}
      onMoveShouldSetResponder={() => Boolean(onScrub)}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(event) => pick(event.nativeEvent.locationX)}
      onResponderMove={(event) => pick(event.nativeEvent.locationX)}
      onResponderRelease={() => {
        setActive(null);
        onScrub?.(null);
      }}
      onResponderTerminate={() => {
        setActive(null);
        onScrub?.(null);
      }}
    >
      {series.map((point, index) => {
        const height = Math.max(8, (point.cents / max) * 120);
        const on = active == null ? index === series.length - 1 : index <= active;
        return (
          <View key={`${point.date}-${index}`} style={styles.chartCol}>
            <View style={[styles.chartBar, { height, opacity: on ? 0.9 : 0.28 }]} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 16, paddingBottom: 36, gap: 24 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  back: { color: colors.ink, fontSize: 16, fontWeight: "500" },
  title: { fontSize: 32, fontWeight: "600", letterSpacing: -1.3, color: colors.ink },
  subtitle: { marginTop: 4, fontSize: 15, lineHeight: 21, color: colors.muted },
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: "500", color: colors.muted },
  input: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
  multiline: { minHeight: 120, textAlignVertical: "top" },
  button: { backgroundColor: colors.ink, borderRadius: 999, minHeight: 44, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
  quiet: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.lineStrong },
  danger: { backgroundColor: colors.danger },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  quietText: { color: colors.ink },
  row: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
    minHeight: 56,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  section: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  sectionTitle: { fontSize: 13, fontWeight: "500", color: colors.muted, letterSpacing: -0.1 },
  sectionTrail: { fontSize: 15, fontWeight: "600", color: colors.ink, letterSpacing: -0.3 },
  sectionAction: { fontSize: 15, fontWeight: "600", color: colors.accentInk },
  ledger: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 16, paddingVertical: 10 },
  divided: { borderTopWidth: 1, borderTopColor: colors.line },
  ledgerCopy: { flex: 1, gap: 2 },
  meta: { fontSize: 12, color: colors.tertiary },
  amount: { fontSize: 15, fontWeight: "600", color: colors.ink, letterSpacing: -0.3 },
  rowTitle: { flex: 1, fontSize: 16, fontWeight: "500", color: colors.ink, letterSpacing: -0.2 },
  rowDetail: { fontSize: 15, color: colors.muted },
  note: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  loading: { paddingVertical: 24, alignItems: "center", gap: 8 },
  hero: {
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
    paddingTop: 18,
    paddingHorizontal: 18,
  },
  heroWash: {
    position: "absolute",
    right: -30,
    top: -60,
    width: 200,
    height: 160,
    borderRadius: 100,
    backgroundColor: "rgba(27, 122, 98, 0.14)",
  },
  heroLabel: { fontSize: 13, fontWeight: "500", color: colors.muted, letterSpacing: -0.1 },
  heroFigure: { marginTop: 2, fontSize: 48, fontWeight: "600", letterSpacing: -2, color: colors.ink },
  facts: {
    marginHorizontal: -18,
    marginTop: 2,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    flexDirection: "row",
    gap: 12,
  },
  kicker: { fontSize: 12, fontWeight: "500", color: colors.tertiary },
  factValue: { fontSize: 15, fontWeight: "600", letterSpacing: -0.3, color: colors.ink },
  mix: { flexDirection: "row", height: 8, gap: 2, backgroundColor: colors.fill },
  track: { height: 6, borderRadius: 99, backgroundColor: colors.fill, overflow: "hidden" },
  chart: { height: 148, marginHorizontal: -18, marginTop: 8, flexDirection: "row", alignItems: "flex-end", gap: 3, paddingHorizontal: 12 },
  chartCol: { flex: 1, justifyContent: "flex-end" },
  chartBar: { backgroundColor: colors.accent, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  monthNav: { flexDirection: "row", alignItems: "center", gap: 4 },
  monthBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  monthChevron: { fontSize: 26, lineHeight: 28, color: colors.ink },
  monthLabel: { minWidth: 132, textAlign: "center", fontSize: 17, fontWeight: "600", letterSpacing: -0.4, color: colors.ink },
  banner: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(27, 122, 98, 0.28)",
    backgroundColor: "#e7f3ef",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bannerText: { flex: 1, fontSize: 16, fontWeight: "600", letterSpacing: -0.3, color: colors.ink },
  search: {
    backgroundColor: colors.fill,
    borderRadius: 12,
    minHeight: 40,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.ink,
  },
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  sheetBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(20, 24, 31, 0.32)" },
  sheet: { maxHeight: "88%", backgroundColor: colors.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  handle: { width: 36, height: 5, borderRadius: 99, backgroundColor: colors.fillStrong, alignSelf: "center", marginTop: 8 },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  sheetTitle: { flex: 1, fontSize: 17, fontWeight: "600", letterSpacing: -0.3, color: colors.ink },
});
