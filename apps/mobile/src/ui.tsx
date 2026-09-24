import { router } from "expo-router";
import { ReactNode, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useWordmark } from "./brand";
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
    <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
      <View style={{ transform: [{ rotate: "180deg" }] }}>
        <Icon name="chevron" size={18} color={colors.ink} />
      </View>
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
  const wordmark = useWordmark();
  const body = (
    <>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {title ? (
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, title === "Shelf" ? { fontFamily: wordmark, fontWeight: "600" } : null]}>{title}</Text>
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
  shelfKey,
  placeholder,
  keyboardType,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  /** Masked Shelf key. It is not a password, so the phone must not offer to save it. */
  shelfKey?: boolean;
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
        secureTextEntry={secureTextEntry || shelfKey}
        placeholder={placeholder}
        keyboardType={shelfKey ? "default" : keyboardType}
        multiline={multiline}
        autoCapitalize="none"
        autoCorrect={shelfKey ? false : undefined}
        autoComplete={shelfKey ? "off" : undefined}
        textContentType={shelfKey ? "none" : undefined}
        importantForAutofill={shelfKey ? "no" : undefined}
        spellCheck={shelfKey ? false : undefined}
        accessibilityLabel={label}
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
  block,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  tone?: "primary" | "quiet" | "danger";
  block?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={[styles.button, tone === "quiet" && styles.quiet, tone === "danger" && styles.danger, block && styles.buttonBlock]}
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

export function Switch({ on }: { on: boolean }) {
  return (
    <View style={[styles.switch, on ? styles.switchOn : null]}>
      <View style={[styles.knob, on ? styles.knobOn : null]} />
    </View>
  );
}

export function ToggleRow({ label, detail, on, onPress, divided }: { label: string; detail?: string; on: boolean; onPress: () => void; divided?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.ledger, divided ? styles.divided : null, pressed ? { backgroundColor: colors.fill } : null]}>
      <View style={styles.ledgerCopy}>
        <Text style={styles.rowTitle}>{label}</Text>
        {detail ? <Text style={styles.meta}>{detail}</Text> : null}
      </View>
      <Switch on={on} />
    </Pressable>
  );
}

export function MenuRow({ title, icon, onPress, divided, danger, active }: { title: string; icon?: string; onPress: () => void; divided?: boolean; danger?: boolean; active?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.ledger, divided ? styles.divided : null, pressed ? { backgroundColor: colors.fill } : null]}>
      {icon ? (
        <View style={[styles.menuGlyph, active ? { backgroundColor: colors.accentSoft } : null]}>
          <Icon name={icon} size={18} color={danger ? colors.danger : active ? colors.accentInk : colors.ink} />
        </View>
      ) : null}
      <Text style={[styles.rowTitle, { fontWeight: "500", color: danger ? colors.danger : active ? colors.accentInk : colors.ink }]}>{title}</Text>
      {danger ? null : <Icon name="chevron" size={16} color={colors.tertiary} />}
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

export function Segment({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  return (
    <View style={styles.segment}>
      <View
        pointerEvents="none"
        style={[
          styles.segmentThumb,
          {
            width: `${100 / options.length}%`,
            left: `${(index * 100) / options.length}%`,
          },
        ]}
      />
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable key={option.value} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => onChange(option.value)} style={styles.segmentItem}>
            <Text style={[styles.segmentLabel, selected ? { color: colors.ink } : null]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Hero({
  label,
  cents,
  tone,
  signed = false,
  empty,
  status,
  points,
  reference,
  caption,
  onScrub,
  meter,
  shares,
  footer,
  children,
}: {
  label: string;
  cents: number;
  tone?: "good" | "bad";
  signed?: boolean;
  empty?: string;
  status?: { label: string; tone: "good" | "warn" | "bad" | "neutral" } | null;
  points?: { date: string; cents: number }[];
  reference?: { cents: number; label: string };
  caption?: string;
  onScrub?: (point: { date: string; cents: number } | null) => void;
  meter?: { value: number; max: number; color?: string };
  shares?: { label: string; cents: number; color: string }[];
  footer?: string;
  children?: ReactNode;
}) {
  const shownShares = (shares ?? []).filter((share) => share.cents > 0);
  const live = (points?.length ?? 0) >= 2;
  const figure = empty ? empty : signed ? (cents < 0 ? `−${money(Math.abs(cents))}` : money(cents)) : money(cents);
  return (
    <View style={styles.hero}>
      <View pointerEvents="none" style={styles.heroWash} />
      <View style={styles.heroTop}>
        <Text style={styles.heroLabel}>{label}</Text>
        {status?.label ? (
          <Text style={[styles.status, status.tone === "good" ? { color: colors.positive } : null, status.tone === "bad" ? { color: colors.danger } : null, status.tone === "warn" ? { color: colors.warn } : null]}>
            {status.label}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.heroFigure, empty ? styles.heroEmpty : null, tone === "bad" ? { color: colors.danger } : null, tone === "good" ? { color: colors.positive } : null]}>
        {figure}
      </Text>
      {live && points ? (
        <SpendChart points={points} onScrub={onScrub} reference={reference} caption={caption} />
      ) : shownShares.length ? (
        <View style={{ marginTop: 16, marginBottom: children || footer ? 0 : 16, gap: 8 }}>
          <View style={[styles.mix, { borderRadius: 99, overflow: "hidden" }]}>
            {shownShares.map((share) => (
              <View key={share.label} style={{ flexGrow: share.cents, flexBasis: 6, backgroundColor: share.color, borderRadius: 99 }} />
            ))}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 6 }}>
            {shownShares.map((share) => (
              <Text key={share.label} style={styles.kicker}>
                {share.label} {money(share.cents)}
              </Text>
            ))}
          </View>
        </View>
      ) : meter ? (
        <View style={{ marginTop: 16, marginBottom: children || footer ? 0 : 16 }}>
          <Progress value={meter.value} max={meter.max} color={meter.color} />
        </View>
      ) : null}
      {children}
      {footer ? <Text style={styles.heroFooter}>{footer}</Text> : null}
      {!children && !footer && !live && !shownShares.length && !meter ? <View style={{ height: 18 }} /> : null}
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

function curvePoint(start: number, controlA: number, controlB: number, end: number, t: number) {
  const rest = 1 - t;
  return rest * rest * rest * start + 3 * rest * rest * t * controlA + 3 * rest * t * t * controlB + t * t * t * end;
}

/** Samples the same cubic the old summary chart used, so the area can be drawn with views. */
function smoothSamples(coords: { x: number; y: number }[], step: number) {
  const samples: { x: number; y: number }[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const current = coords[i];
    const next = coords[i + 1];
    const mid = (current.x + next.x) / 2;
    const count = Math.max(1, Math.round(Math.max(next.x - current.x, step) / step));
    for (let s = 0; s < count; s++) {
      const t = s / count;
      samples.push({
        x: curvePoint(current.x, mid, mid, next.x, t),
        y: curvePoint(current.y, current.y, next.y, next.y, t),
      });
    }
  }
  samples.push(coords[coords.length - 1]);
  return samples;
}

export function SpendChart({
  points,
  onScrub,
  reference,
  caption,
  color = colors.accent,
}: {
  points: { date: string; cents: number }[];
  onScrub?: (point: { date: string; cents: number } | null) => void;
  reference?: { cents: number; label: string };
  caption?: string;
  color?: string;
}) {
  const series = points.length > 0 && points[0].cents !== 0 ? [{ date: points[0].date, cents: 0 }, ...points] : points;
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  if (series.length < 2) return null;
  const height = 148;
  const drawWidth = width || 320;
  const values = series.map((point) => point.cents);
  if (reference) values.push(reference.cents);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const raw = max - min;
  const pad = raw === 0 ? Math.max(Math.abs(max) * 0.22, 1) : raw * 0.22;
  const lo = min - pad;
  const hi = max + pad;
  const span = hi - lo || 1;
  const insetX = 10;
  const insetY = 14;

  function xOf(index: number) {
    if (series.length <= 1) return drawWidth / 2;
    return insetX + (index / (series.length - 1)) * (drawWidth - insetX * 2);
  }

  function yOf(cents: number) {
    return insetY + ((hi - cents) / span) * (height - insetY * 2);
  }

  const coords = series.map((point, index) => ({ x: xOf(index), y: yOf(point.cents) }));
  const samples = smoothSamples(coords, 3);
  const dot = coords[active ?? coords.length - 1];
  const dotSize = active == null ? 9 : 13;
  const refY = reference ? yOf(reference.cents) : null;

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
      {samples.map((sample, index) => {
        const next = samples[index + 1];
        const columnWidth = Math.max(1, (next?.x ?? sample.x + 3) - sample.x);
        const fill = Math.max(0, height - sample.y);
        return (
          <View key={`fill-${index}`} pointerEvents="none" style={{ position: "absolute", left: sample.x, top: sample.y, width: columnWidth, height: fill }}>
            <View style={{ flex: 1, backgroundColor: color, opacity: 0.22 }} />
            <View style={{ flex: 1, backgroundColor: color, opacity: 0.06 }} />
          </View>
        );
      })}
      {samples.slice(0, -1).map((sample, index) => {
        const next = samples[index + 1];
        const dx = next.x - sample.x;
        const dy = next.y - sample.y;
        const length = Math.hypot(dx, dy);
        if (length < 0.5) return null;
        return (
          <View
            key={`line-${index}`}
            pointerEvents="none"
            style={{
              position: "absolute",
              left: (sample.x + next.x) / 2 - length / 2,
              top: (sample.y + next.y) / 2 - 1.25,
              width: length,
              height: 2.5,
              borderRadius: 2,
              backgroundColor: color,
              transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
            }}
          />
        );
      })}
      {active != null ? (
        <View pointerEvents="none" style={{ position: "absolute", left: dot.x, top: 0, bottom: 0, width: 1, backgroundColor: colors.ink, opacity: 0.35 }} />
      ) : null}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: dot.x - dotSize / 2,
          top: dot.y - dotSize / 2,
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize / 2,
          backgroundColor: color,
          borderWidth: 3,
          borderColor: "#fff",
        }}
      />
      {refY != null ? (
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: refY, height: 1, borderTopWidth: 1, borderStyle: "dashed", borderColor: colors.tertiary }} />
      ) : null}
      {reference && refY != null ? (
        <Text pointerEvents="none" style={[styles.chartTag, { top: refY - 6, left: 8 }]}>
          {reference.label}
        </Text>
      ) : null}
      {caption ? (
        <Text pointerEvents="none" style={[styles.chartTag, { top: 2, right: 8 }]}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

export type BarSeries = { key: string; color: string };

export function GroupedBars({
  points,
  series,
  onPress,
}: {
  points: { label: string; values: Record<string, number> }[];
  series: BarSeries[];
  onPress?: (label: string) => void;
}) {
  const max = Math.max(1, ...points.flatMap((point) => series.map((item) => point.values[item.key] ?? 0)));
  return (
    <View style={{ gap: 10 }}>
      <View style={{ height: 168, flexDirection: "row", alignItems: "flex-end", gap: 6 }}>
        {points.map((point) => (
          <Pressable key={point.label} onPress={onPress ? () => onPress(point.label) : undefined} style={{ flex: 1, height: "100%", flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 2 }}>
            {series.map((item) => {
              const value = point.values[item.key] ?? 0;
              return <View key={item.key} style={{ width: 7, height: `${Math.max(2, Math.round((value / max) * 100))}%`, borderRadius: 3, backgroundColor: item.color }} />;
            })}
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: "row" }}>
        {points.map((point) => (
          <Text key={point.label} numberOfLines={1} style={{ flex: 1, textAlign: "center", fontSize: 10, color: colors.tertiary }}>
            {point.label}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 16 }}>
        {series.map((item) => (
          <View key={item.key} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: item.color }} />
            <Text style={styles.kicker}>{item.key}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 16, paddingBottom: 36, gap: 24 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 2, minHeight: 32, marginLeft: -2 },
  back: { color: colors.ink, fontSize: 15, fontWeight: "500", letterSpacing: -0.15 },
  title: { fontSize: 32, fontWeight: "600", letterSpacing: -1.3, color: colors.ink },
  subtitle: { marginTop: 4, fontSize: 15, lineHeight: 21, color: colors.muted },
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
    shadowColor: "#14181f",
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
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
  button: { alignSelf: "flex-start", backgroundColor: colors.ink, borderRadius: 999, minHeight: 44, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
  buttonBlock: { alignSelf: "stretch" },
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
  menuGlyph: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.fill },
  divided: { borderTopWidth: 1, borderTopColor: colors.line },
  ledgerCopy: { flex: 1, gap: 2 },
  meta: { fontSize: 12, color: colors.tertiary },
  amount: { fontSize: 15, fontWeight: "600", color: colors.ink, letterSpacing: -0.3, fontVariant: ["tabular-nums"] },
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
    shadowColor: "#14181f",
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
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
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  heroLabel: { fontSize: 13, fontWeight: "500", color: colors.muted, letterSpacing: -0.1 },
  heroFigure: { marginTop: 2, fontSize: 48, fontWeight: "600", letterSpacing: -2, color: colors.ink, fontVariant: ["tabular-nums"] },
  heroEmpty: { fontSize: 28, fontWeight: "500", letterSpacing: -0.6, color: colors.muted },
  heroFooter: { marginHorizontal: -18, marginTop: 12, paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line, fontSize: 13, color: colors.muted },
  status: { fontSize: 13, fontWeight: "600", color: colors.muted },
  chartTag: { position: "absolute", fontSize: 10, fontWeight: "700", letterSpacing: 1, color: colors.tertiary, textTransform: "uppercase" },
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
  chart: { height: 148, marginHorizontal: -18, marginTop: 8 },
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
  switch: {
    width: 51,
    height: 31,
    borderRadius: 999,
    backgroundColor: "rgba(120, 120, 128, 0.16)",
    padding: 2,
    justifyContent: "center",
  },
  switchOn: { backgroundColor: colors.positive },
  knob: {
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 2 },
  },
  knobOn: { transform: [{ translateX: 20 }] },
  segment: { position: "relative", minHeight: 40, padding: 3, borderRadius: 999, backgroundColor: colors.fill, flexDirection: "row" },
  segmentThumb: { position: "absolute", top: 3, bottom: 3, borderRadius: 999, backgroundColor: colors.card },
  segmentItem: { flex: 1, minHeight: 34, alignItems: "center", justifyContent: "center" },
  segmentLabel: { fontSize: 13, fontWeight: "600", color: colors.muted, letterSpacing: -0.1 },
});
