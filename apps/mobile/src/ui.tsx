import { router } from "expo-router";
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Dimensions, Easing, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
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
  scrollable = true,
  onRefresh,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  refresh?: ReactNode;
  action?: ReactNode;
  framed?: boolean;
  scrollable?: boolean;
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

  if (!scrollable) {
    const rawBody = (
      <ScrollLockProvider value={setScrollLocked}>
        <View style={{ flex: 1 }}>
          {refresh ? <View style={{ paddingHorizontal: 16, marginBottom: -8 }}>{refresh}</View> : null}
          {title ? (
            <View style={[styles.header, { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }]}>
              <View style={{ flexShrink: 1 }}>
                <Text style={[styles.title, title === "Shelf" ? { fontFamily: wordmark, fontWeight: "600" } : null]}>{title}</Text>
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              </View>
              {action}
            </View>
          ) : null}
          {children}
        </View>
        {footer}
      </ScrollLockProvider>
    );
    if (framed) return <View style={styles.safe}>{rawBody}</View>;
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        {rawBody}
      </SafeAreaView>
    );
  }

  const body = (
    <>
      <ScrollLockProvider value={setScrollLocked}>
      <ScrollView
        scrollEnabled={scrollEnabled}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={colors.ink} /> : undefined}
      >
        {refresh ? <View style={{ marginBottom: -8 }}>{refresh}</View> : null}
        {title ? (
          <View style={styles.header}>
            <View style={{ flexShrink: 1 }}>
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

export function Card({
  children,
  style,
  tone,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: "default" | "inset";
}) {
  const styles = useStyles();
  return <View style={[styles.card, tone === "inset" ? styles.cardInset : null, style]}>{children}</View>;
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
      onPress={onPress}
      onPressIn={() => {
        tapPress();
        settle(0.97);
      }}
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

export function InlineLoading({ count = 2 }: { count?: number }) {
  const styles = useStyles();
  return (
    <View style={{ gap: 12, paddingVertical: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.fill }} />
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ width: "55%", height: 13, borderRadius: 4, backgroundColor: colors.fillStrong }} />
            <View style={{ width: "35%", height: 10, borderRadius: 4, backgroundColor: colors.fill }} />
          </View>
          <View style={{ width: 48, height: 14, borderRadius: 4, backgroundColor: colors.fillStrong }} />
        </View>
      ))}
    </View>
  );
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
  topRight,
  points,
  reference,
  caption,
  color,
  onScrub,
  live = false,
  meter,
  shares,
  footer,
  onPressFigure,
  subtitle,
  children,
}: {
  label: string;
  cents: number;
  tone?: "good" | "bad";
  signed?: boolean;
  empty?: string;
  status?: { label: string; tone: "good" | "warn" | "bad" | "neutral" } | null;
  topRight?: ReactNode;
  points?: { date: string; cents: number }[];
  reference?: { cents: number; label: string };
  caption?: string;
  color?: string;
  onScrub?: (point: { date: string; cents: number } | null) => void;
  /** Skip the figure animation while a finger is on the chart. */
  live?: boolean;
  meter?: { value: number; max: number; color?: string };
  shares?: { label: string; cents: number; color: string }[];
  footer?: string;
  onPressFigure?: () => void;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  const styles = useStyles();
  const shownShares = (shares ?? []).filter((share) => share.cents > 0);
  const charting = (points?.length ?? 0) >= 2;
  const figureText = empty
    ? empty
    : signed && cents < 0
      ? `-${money(Math.abs(cents))}`
      : signed && cents > 0
        ? `+${money(cents)}`
        : money(cents);

  return (
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
          <Text style={styles.heroLabel}>{label}</Text>
          {status?.label ? (
            <Text style={[styles.status, status.tone === "good" ? { color: colors.positive } : null, status.tone === "bad" ? { color: colors.danger } : null, status.tone === "warn" ? { color: colors.warn } : null]}>
              {status.label}
            </Text>
          ) : null}
        </View>
        {topRight}
      </View>
      {onPressFigure ? (
        <Pressable onPress={onPressFigure} hitSlop={8}>
          <Text
            style={[
              styles.heroFigure,
              empty ? styles.heroEmpty : null,
              tone === "bad" ? { color: colors.danger } : null,
              tone === "good" ? { color: colors.positive } : null,
            ]}
          >
            {figureText}
          </Text>
        </Pressable>
      ) : (
        <Text
          style={[
            styles.heroFigure,
            empty ? styles.heroEmpty : null,
            tone === "bad" ? { color: colors.danger } : null,
            tone === "good" ? { color: colors.positive } : null,
          ]}
        >
          {figureText}
        </Text>
      )}
      {subtitle ? <View style={{ marginTop: 4 }}>{subtitle}</View> : null}
      {charting && points ? (
        <SpendChart points={points} onScrub={onScrub} reference={reference} caption={caption} color={color} />
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
  contentStyle,
  disabled,
  scaleTo = 0.97,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<TextStyle | View["props"]["style"]>;
  contentStyle?: StyleProp<ViewStyle>;
  disabled?: boolean;
  scaleTo?: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => {
        tapPress();
        Animated.spring(scale, { toValue: scaleTo, useNativeDriver: true, stiffness: 500, damping: 26, mass: 0.6 }).start();
      }}
      onPressOut={() =>
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, stiffness: 500, damping: 26, mass: 0.6 }).start()
      }
      style={style as never}
    >
      <Animated.View
        style={[
          {
            transform: [{ scale }],
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          },
          contentStyle,
        ]}
      >
        {children}
      </Animated.View>
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

export function ReviewBanner({
  label,
  count,
  subtitle,
  onPress,
}: {
  label?: string;
  count?: number;
  subtitle?: string;
  onPress: () => void;
}) {
  const styles = useStyles();
  const title = label || "Categorize purchases";
  const desc = subtitle ?? (count ? `${count} ${count === 1 ? "purchase" : "purchases"} to review` : null);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.banner, pressed ? { backgroundColor: colors.fill } : null]}
    >
      <View style={styles.bannerIconWrap}>
        <Icon name="tag" size={17} color={colors.accentInk} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.bannerTitle} numberOfLines={1}>
          {title}
        </Text>
        {desc ? (
          <Text style={styles.bannerSubtitle} numberOfLines={1}>
            {desc}
          </Text>
        ) : null}
      </View>
      {count ? (
        <View style={styles.bannerBadge}>
          <Text style={styles.bannerBadgeText}>{count}</Text>
        </View>
      ) : null}
      <Icon name="chevron" size={16} color={colors.tertiary} />
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

export function Sheet({
  title,
  subtitle,
  onClose,
  children,
  height,
  minHeight,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  height?: number | `${number}%`;
  minHeight?: number | `${number}%`;
}) {
  const styles = useStyles();
  const screenHeight = Dimensions.get("window").height;
  const translateY = useSharedValue(screenHeight);
  const [closing, setClosing] = useState(false);
  const isClosing = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    translateY.value = withSpring(0, {
      damping: 28,
      stiffness: 340,
      mass: 0.8,
    });
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [translateY]);

  const dismiss = useCallback(() => {
    if (isClosing.current) return;
    isClosing.current = true;
    setClosing(true);
    tapPress();

    translateY.value = withTiming(screenHeight, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
    });

    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => {
      onCloseRef.current();
    }, 180);
  }, [screenHeight, translateY]);

  const panGesture = Gesture.Pan()
    .activeOffsetY([-6, 6])
    .onUpdate((event) => {
      if (isClosing.current) return;
      if (event.translationY > 0) {
        translateY.value = event.translationY;
      } else {
        translateY.value = -Math.pow(Math.abs(event.translationY), 0.72);
      }
    })
    .onFinalize((event) => {
      if (isClosing.current) return;
      if (event.translationY > 80 || event.velocityY > 450) {
        runOnJS(dismiss)();
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
      [0, 240],
      [1, 0],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  return (
    <Modal
      visible
      animationType="none"
      transparent
      onRequestClose={dismiss}
    >
      <View style={styles.sheetWrap} pointerEvents={closing ? "none" : "auto"}>
        <Reanimated.View style={[styles.sheetBackdrop, backdropAnimatedStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
        </Reanimated.View>
        <Reanimated.View
          style={[
            styles.sheet,
            minHeight ? { minHeight } : null,
            height ? { height } : null,
            sheetAnimatedStyle,
          ]}
        >
          <GestureDetector gesture={panGesture}>
            <View style={{ paddingTop: 8, paddingBottom: 6 }}>
              <View style={{ paddingVertical: 4 }}>
                <View style={styles.handle} />
              </View>
              <View style={styles.sheetHead}>
                <View style={{ flex: 1, gap: 2, marginRight: 12 }}>
                  <Text style={styles.sheetTitle} numberOfLines={1}>
                    {title}
                  </Text>
                  {subtitle ? (
                    <Text style={styles.sheetSubtitle} numberOfLines={1}>
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
                <Pressable onPress={dismiss} hitSlop={16} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={styles.sectionAction}>Done</Text>
                </Pressable>
              </View>
            </View>
          </GestureDetector>
          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36, gap: 14 }}>
            {children}
          </ScrollView>
        </Reanimated.View>
      </View>
    </Modal>
  );
}



function makeStyles(colors: Palette) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 16, paddingBottom: 36, gap: 24 },
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
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
  cardInset: {
    backgroundColor: colors.scheme === "dark" ? "#161922" : "#f6f8fa",
    borderColor: colors.scheme === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(20, 24, 31, 0.08)",
  },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: "500", color: colors.muted },
  input: {
    backgroundColor: colors.scheme === "dark" ? "#161922" : "#f6f8fa",
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
  monthNav: { flexDirection: "row", alignItems: "center", gap: 2 },
  monthBtn: { width: 28, height: 32, alignItems: "center", justifyContent: "center" },
  monthChevron: { fontSize: 24, lineHeight: 26, color: colors.ink },
  monthLabel: { minWidth: 104, textAlign: "center", fontSize: 16, fontWeight: "600", letterSpacing: -0.4, color: colors.ink },
  banner: {
    minHeight: 58,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    shadowColor: "#14181f",
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  bannerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerTitle: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: -0.3,
    color: colors.ink,
  },
  bannerSubtitle: {
    fontSize: 13,
    color: colors.muted,
  },
  bannerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
    backgroundColor: colors.fill,
  },
  bannerBadgeText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  search: {
    backgroundColor: colors.fill,
    borderRadius: 12,
    minHeight: 40,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.ink,
  },
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  sheetBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.scheme === "dark" ? "rgba(0, 0, 0, 0.76)" : "rgba(15, 23, 42, 0.45)",
  },
  sheet: {
    maxHeight: "88%",
    backgroundColor: colors.scheme === "dark" ? "#202530" : "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopColor: colors.scheme === "dark" ? "rgba(255, 255, 255, 0.22)" : "rgba(0, 0, 0, 0.08)",
    borderLeftColor: colors.scheme === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.04)",
    borderRightColor: colors.scheme === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.04)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: colors.scheme === "dark" ? 0.6 : 0.16,
    shadowRadius: 24,
    elevation: 24,
  },
  handle: {
    width: 38,
    height: 5,
    borderRadius: 99,
    backgroundColor: colors.scheme === "dark" ? "rgba(255, 255, 255, 0.35)" : colors.fillStrong,
    alignSelf: "center",
    marginTop: 8,
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  sheetTitle: { fontSize: 17, fontWeight: "600", letterSpacing: -0.3, color: colors.ink },
  sheetSubtitle: { fontSize: 13, fontWeight: "500", color: colors.muted, marginTop: 1 },
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
