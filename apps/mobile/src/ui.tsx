import { router } from "expo-router";
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useWordmark } from "./brand";
import { ScrollLockProvider } from "./scroll";
import { GroupedBars, SpendChart } from "./chart";
import { flowMoney, money, shiftMonth } from "./format";
import { tapPress, tapSelect } from "./haptic";
import { Icon, MerchantMark } from "./icons";
import { colors, useTheme, type Palette } from "./theme";

export { GroupedBars, SpendChart };

export { colors };

function useStyles() {
  const { palette } = useTheme();
  return useMemo(() => makeStyles(palette), [palette]);
}

export function Back() {
  const styles = useStyles();
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
  onRefresh,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  refresh?: ReactNode;
  action?: ReactNode;
  framed?: boolean;
  onRefresh?: () => Promise<unknown> | void;
}) {
  const styles = useStyles();
  const wordmark = useWordmark();
  const [refreshing, setRefreshing] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const setScrollLocked = useCallback((locked: boolean) => {
    setScrollEnabled(!locked);
  }, []);
  function pull() {
    setRefreshing(true);
    Promise.resolve(onRefresh?.()).finally(() => setRefreshing(false));
  }
  const body = (
    <>
      <ScrollLockProvider value={setScrollLocked}>
      <ScrollView
        scrollEnabled={scrollEnabled}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={colors.ink} /> : undefined}
      >
        {refresh ? <View style={{ marginBottom: -8 }}>{refresh}</View> : null}
        {title ? (
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, title === "Shelf" ? { fontFamily: wordmark, fontWeight: "600" } : null]}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            {action}
          </View>
        ) : null}
        {children}
      </ScrollView>
      </ScrollLockProvider>
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
  const styles = useStyles();
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
  const styles = useStyles();
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
  const styles = useStyles();
  const scale = useRef(new Animated.Value(1)).current;
  function settle(to: number) {
    Animated.spring(scale, { toValue: to, useNativeDriver: true, stiffness: 520, damping: 28, mass: 0.6 }).start();
  }
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        tapPress();
        onPress();
      }}
      onPressIn={() => settle(0.97)}
      onPressOut={() => settle(1)}
      disabled={busy}
    >
      <Animated.View style={[styles.button, tone === "quiet" && styles.quiet, tone === "danger" && styles.danger, block && styles.buttonBlock, { transform: [{ scale }] }]}>
        {busy ? (
          <ActivityIndicator color={tone === "primary" ? "#fff" : colors.ink} />
        ) : (
          <Text style={[styles.buttonText, tone !== "primary" && styles.quietText, tone === "danger" && { color: "#fff" }]}>{label}</Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

export function Section({ title, action, onAction, trailing }: { title: string; action?: string; onAction?: () => void; trailing?: string }) {
  const styles = useStyles();
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
  const styles = useStyles();
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
    <PressScale onPress={onPress} pressedStyle={{ backgroundColor: colors.fill }}>
      {body}
    </PressScale>
  );
}

function PressScale({ children, onPress, pressedStyle }: { children: ReactNode; onPress: () => void; pressedStyle?: object }) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, stiffness: 520, damping: 28, mass: 0.6 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, stiffness: 520, damping: 28, mass: 0.6 }).start()}
      style={({ pressed }) => (pressed ? pressedStyle : null)}
    >
      <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
    </Pressable>
  );
}

export function FlowAmount({ cents, size = 15 }: { cents: number; size?: number }) {
  const styles = useStyles();
  const flow = flowMoney(cents);
  return <Text style={[styles.amount, { fontSize: size, color: flow.color }]}>{flow.text}</Text>;
}

export function Row({ title, detail, icon, onPress }: { title: string; detail?: string; icon?: string; onPress?: () => void }) {
  const styles = useStyles();
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
  const styles = useStyles();
  const x = useRef(new Animated.Value(on ? 20 : 0)).current;
  useEffect(() => {
    Animated.spring(x, { toValue: on ? 20 : 0, useNativeDriver: true, stiffness: 520, damping: 32, mass: 0.7 }).start();
  }, [on, x]);
  return (
    <View style={[styles.switch, on ? styles.switchOn : null]}>
      <Animated.View style={[styles.knob, { transform: [{ translateX: x }] }]} />
    </View>
  );
}

export function ToggleRow({ label, detail, on, onPress, divided }: { label: string; detail?: string; on: boolean; onPress: () => void; divided?: boolean }) {
  const styles = useStyles();
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
  const styles = useStyles();
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
  const styles = useStyles();
  return <Text style={styles.note}>{children}</Text>;
}

export function Loading({ label = "Loading" }: { label?: string }) {
  const styles = useStyles();
  if (label === "Loading") return <Skeleton />;
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.ink} />
      <Text style={styles.note}>{label}</Text>
    </View>
  );
}

function Skeleton() {
  const styles = useStyles();
  const opacity = useSharedValue(0.35);

  useEffect(() => {
    opacity.value = withTiming(0.85, { duration: 750 }, () => {
      // Loop with sinusoidal pulse
      const pulse = () => {
        opacity.value = withTiming(0.35, { duration: 750 }, () => {
          opacity.value = withTiming(0.85, { duration: 750 }, pulse);
        });
      };
      pulse();
    });
  }, [opacity]);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Reanimated.View style={[{ gap: 16 }, shimmerStyle]}>
      {/* Hero Skeleton Card */}
      <View style={[styles.hero, { gap: 14, paddingBottom: 20 }]}>
        <View style={{ width: 100, height: 13, borderRadius: 6, backgroundColor: colors.fillStrong }} />
        <View style={{ width: 190, height: 42, borderRadius: 10, backgroundColor: colors.fillStrong }} />
        <View style={{ height: 80, borderRadius: 12, backgroundColor: colors.fill, marginTop: 4 }} />
        <View style={{ flexDirection: "row", gap: 12, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 14 }}>
          <View style={{ flex: 1, height: 28, borderRadius: 6, backgroundColor: colors.fill }} />
          <View style={{ flex: 1, height: 28, borderRadius: 6, backgroundColor: colors.fill }} />
          <View style={{ flex: 1, height: 28, borderRadius: 6, backgroundColor: colors.fill }} />
        </View>
      </View>

      {/* Pill Actions Strip Skeleton */}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ width: 100, height: 38, borderRadius: 99, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line }} />
        <View style={{ width: 120, height: 38, borderRadius: 99, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line }} />
        <View style={{ width: 90, height: 38, borderRadius: 99, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line }} />
      </View>

      {/* Rows Card Skeleton */}
      <View style={styles.card}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[
              styles.ledger,
              i > 0 && styles.divided,
              { alignItems: "center", gap: 12, paddingVertical: 14 },
            ]}
          >
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.fillStrong }} />
            <View style={{ flex: 1, gap: 6 }}>
              <View style={{ width: "55%", height: 14, borderRadius: 5, backgroundColor: colors.fillStrong }} />
              <View style={{ width: "35%", height: 11, borderRadius: 4, backgroundColor: colors.fill }} />
            </View>
            <View style={{ width: 56, height: 16, borderRadius: 5, backgroundColor: colors.fillStrong }} />
          </View>
        ))}
      </View>
    </Reanimated.View>
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
  const styles = useStyles();
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const inner = Math.max(0, width - 6);
  const item = options.length > 0 ? inner / options.length : 0;
  useEffect(() => {
    Animated.spring(x, { toValue: index * item, useNativeDriver: true, stiffness: 460, damping: 34, mass: 0.7 }).start();
  }, [index, item, x]);
  return (
    <View style={styles.segment} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {item > 0 ? (
        <Animated.View pointerEvents="none" style={[styles.segmentThumb, { left: 3, width: item, transform: [{ translateX: x }] }]} />
      ) : null}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              if (option.value !== value) tapSelect();
              onChange(option.value);
            }}
            style={styles.segmentItem}
          >
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
  baselinePoints,
  reference,
  caption,
  color,
  onScrub,
  live = false,
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
  baselinePoints?: { date: string; cents: number }[];
  reference?: { cents: number; label: string };
  caption?: string;
  color?: string;
  onScrub?: (point: { date: string; cents: number } | null) => void;
  /** Skip the figure animation while a finger is on the chart. */
  live?: boolean;
  meter?: { value: number; max: number; color?: string };
  shares?: { label: string; cents: number; color: string }[];
  footer?: string;
  children?: ReactNode;
}) {
  const styles = useStyles();
  const shownShares = (shares ?? []).filter((share) => share.cents > 0);
  const charting = (points?.length ?? 0) >= 2;
  return (
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        <Text style={styles.heroLabel}>{label}</Text>
        {status?.label ? (
          <Text style={[styles.status, status.tone === "good" ? { color: colors.positive } : null, status.tone === "bad" ? { color: colors.danger } : null, status.tone === "warn" ? { color: colors.warn } : null]}>
            {status.label}
          </Text>
        ) : null}
      </View>
      <RollingMoney
        cents={cents}
        signed={signed}
        blank={empty}
        live={live}
        style={[styles.heroFigure, empty ? styles.heroEmpty : null, tone === "bad" ? { color: colors.danger } : null, tone === "good" ? { color: colors.positive } : null]}
      />
      {charting && points ? (
        <SpendChart points={points} onScrub={onScrub} reference={reference} caption={caption} color={color} baselinePoints={baselinePoints} />
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
      {!children && !footer && !charting && !shownShares.length && !meter ? <View style={{ height: 18 }} /> : null}
    </View>
  );
}

export function Facts({ items }: { items: { kicker: string; value: string; color?: string }[] }) {
  const styles = useStyles();
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
  const styles = useStyles();
  const shown = rows.filter((row) => row.cents > 0);
  const signature = shown.map((row) => row.cents).join(",");
  const grow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    grow.setValue(0);
    Animated.timing(grow, { toValue: 1, duration: 560, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [grow, signature]);
  if (shown.length < 2) return null;
  return (
    <View style={styles.mix}>
      {shown.map((row) => (
        <Animated.View
          key={row.key}
          style={{
            flexGrow: grow.interpolate({ inputRange: [0, 1], outputRange: [0.01, row.cents] }),
            flexBasis: 4,
            backgroundColor: row.color,
          }}
        />
      ))}
    </View>
  );
}

export function SpringPressable({
  children,
  onPress,
  style,
  disabled,
  scaleTo = 0.97,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<TextStyle | View["props"]["style"]>;
  disabled?: boolean;
  scaleTo?: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        tapPress();
        onPress?.();
      }}
      onPressIn={() =>
        Animated.spring(scale, { toValue: scaleTo, useNativeDriver: true, stiffness: 500, damping: 26, mass: 0.6 }).start()
      }
      onPressOut={() =>
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, stiffness: 500, damping: 26, mass: 0.6 }).start()
      }
      style={style as never}
    >
      <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
    </Pressable>
  );
}

export function Progress({
  value,
  max,
  color = colors.positive,
  markerRatio,
}: {
  value: number;
  max: number;
  color?: string;
  markerRatio?: number;
}) {
  const styles = useStyles();
  const ratio = max <= 0 ? (value > 0 ? 1 : 0) : Math.min(1, value / max);
  const over = max > 0 ? value > max : value > 0;
  const [width, setWidth] = useState(0);
  const fillWidth = useSharedValue(0);

  useEffect(() => {
    fillWidth.value = withTiming(width * ratio, { duration: 420 });
  }, [fillWidth, ratio, width]);

  const fillAnimatedStyle = useAnimatedStyle(() => ({
    width: fillWidth.value,
  }));

  const markerX = markerRatio != null && width > 0 ? Math.min(width, Math.max(0, width * markerRatio)) : null;

  return (
    <View style={styles.track} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <Reanimated.View style={[{ height: "100%", backgroundColor: over ? colors.danger : color, borderRadius: 99 }, fillAnimatedStyle]} />
      {markerX != null ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: Math.max(0, markerX - 1.5),
            top: -2,
            bottom: -2,
            width: 3,
            borderRadius: 1.5,
            backgroundColor: colors.ink,
            opacity: 0.5,
          }}
        />
      ) : null}
    </View>
  );
}

export function MonthNav({ year, month, label, onChange }: { year: number; month: number; label: string; onChange: (year: number, month: number) => void }) {
  const styles = useStyles();
  return (
    <View style={styles.monthNav}>
      <Pressable
        accessibilityLabel="Previous month"
        onPress={() => {
          tapSelect();
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
          tapSelect();
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
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.banner, pressed ? { backgroundColor: colors.fill } : null]}>
      <Text style={styles.bannerText}>{label}</Text>
      <Icon name="chevron" size={18} color={colors.ink} />
    </Pressable>
  );
}

export function SearchField({ value, onChangeText, placeholder }: { value: string; onChangeText: (value: string) => void; placeholder: string }) {
  const styles = useStyles();
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
  const styles = useStyles();
  const translateY = useSharedValue(0);
  const isClosing = useRef(false);

  function dismiss() {
    if (isClosing.current) return;
    isClosing.current = true;
    tapPress();
    onClose();
  }

  const panGesture = Gesture.Pan()
    .activeOffsetY([-6, 6])
    .onUpdate((event) => {
      if (event.translationY > 0) {
        translateY.value = event.translationY;
      } else {
        translateY.value = -Math.pow(Math.abs(event.translationY), 0.72);
      }
    })
    .onEnd((event) => {
      if (event.translationY > 90 || event.velocityY > 500) {
        translateY.value = withTiming(650, { duration: 160, easing: Easing.out(Easing.quad) }, () => {
          runOnJS(dismiss)();
        });
      } else {
        translateY.value = withSpring(0, { damping: 28, stiffness: 480 });
      }
    });

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateY.value,
      [0, 200],
      [1, 0],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  return (
    <Modal visible animationType="none" transparent onRequestClose={dismiss}>
      <View style={styles.sheetWrap}>
        <Reanimated.View style={[styles.sheetBackdrop, backdropAnimatedStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
        </Reanimated.View>
        <Reanimated.View style={[styles.sheet, sheetAnimatedStyle]}>
          <GestureDetector gesture={panGesture}>
            <View style={{ paddingTop: 8, paddingBottom: 6 }}>
              <View style={styles.handle} />
              <View style={styles.sheetHead}>
                <Text style={styles.sheetTitle} numberOfLines={1}>
                  {title}
                </Text>
                <Pressable onPress={dismiss} hitSlop={12} style={{ padding: 4 }}>
                  <Text style={styles.sectionAction}>Done</Text>
                </Pressable>
              </View>
            </View>
          </GestureDetector>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36, gap: 12 }}>
            {children}
          </ScrollView>
        </Reanimated.View>
      </View>
    </Modal>
  );
}

const ROLL = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

function RollingMoney({
  cents,
  signed,
  blank,
  live,
  style,
}: {
  cents: number;
  signed?: boolean;
  blank?: string;
  live?: boolean;
  style: StyleProp<TextStyle>;
}) {
  const text = blank ? blank : signed && cents < 0 ? `−${money(Math.abs(cents))}` : money(cents);
  const fromRef = useRef(text);
  const [from, setFrom] = useState(text);
  const progress = useRef(new Animated.Value(1)).current;
  const [box, setBox] = useState({ w: 26, h: 54 });

  useEffect(() => {
    if (live || blank || fromRef.current === text) {
      fromRef.current = text;
      setFrom(text);
      progress.setValue(1);
      return;
    }
    setFrom(fromRef.current);
    progress.setValue(0);
    const anim = Animated.timing(progress, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    anim.start(({ finished }) => {
      if (finished) fromRef.current = text;
    });
    return () => anim.stop();
  }, [text, live, blank, progress]);

  if (blank || live) return <Text style={style}>{text}</Text>;

  const len = Math.max(from.length, text.length);
  const left = from.padStart(len);
  const right = text.padStart(len);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", height: box.h, marginTop: 2 }}>
      <Text
        style={[style, { position: "absolute", opacity: 0 }]}
        pointerEvents="none"
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          if (height > 0 && width > 0 && (height !== box.h || width !== box.w)) {
            setBox({ w: width, h: height });
          }
        }}
      >
        8
      </Text>
      {right.split("").map((glyph, index) => (
        <Digit key={`${len - index}-${glyph}`} from={left[index]} to={glyph} progress={progress} width={box.w} height={box.h} style={style} />
      ))}
    </View>
  );
}

function Digit({
  from,
  to,
  progress,
  width,
  height,
  style,
}: {
  from: string;
  to: string;
  progress: Animated.Value;
  width: number;
  height: number;
  style: StyleProp<TextStyle>;
}) {
  const fromDigit = /\d/.test(from) ? Number(from) : null;
  const toDigit = /\d/.test(to) ? Number(to) : null;
  if (fromDigit == null || toDigit == null || from === to) {
    return <Text style={[style, { width: to === " " ? 0 : undefined }]}>{to === " " ? "" : to}</Text>;
  }
  let delta = toDigit - fromDigit;
  if (delta > 5) delta -= 10;
  if (delta < -5) delta += 10;
  let start = fromDigit;
  let end = fromDigit + delta;
  if (end < 0) {
    start += 10;
    end += 10;
  }
  const shift = progress.interpolate({ inputRange: [0, 1], outputRange: [-start * height, -end * height] });
  return (
    <View style={{ width, height, overflow: "hidden" }}>
      <Animated.View style={{ transform: [{ translateY: shift }] }}>
        {ROLL.map((glyph, index) => (
          <Text key={index} style={[style, { height, lineHeight: height, width, marginTop: 0 }]}>
            {glyph}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}


function makeStyles(colors: Palette) {
  return StyleSheet.create({
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
  button: { alignSelf: "flex-start", backgroundColor: colors.control, borderRadius: 999, minHeight: 44, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
  buttonBlock: { alignSelf: "stretch" },
  quiet: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.lineStrong },
  danger: { backgroundColor: colors.danger },
  buttonText: { color: colors.controlInk, fontSize: 15, fontWeight: "600" },
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
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
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
}
