import { router } from "expo-router";
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Dimensions, Easing, Keyboard, Modal, PanResponder, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useWordmark } from "./brand";
import { ScrollLockProvider } from "./scroll";
import { GroupedBars, SpendChart } from "./chart";
import { flowMoney, money, monthLabel, shiftMonth, shortMonthLabel, todayISO, shelfColor } from "./format";
import { tapPress, tapSelect, tapSuccess } from "./haptic";
import { Icon, MerchantMark } from "./icons";
import { BlurView } from "expo-blur";
import { colors, useReduceTransparency, useTheme, type Palette } from "./theme";
import { api, peek } from "./api";
import { celebrate } from "./toast";

export { GroupedBars, SpendChart };

export { colors };

function useStyles() {
  const { palette } = useTheme();
  return useMemo(() => makeStyles(palette), [palette]);
}

export function Back({ label = "Back" }: { label?: string }) {
  const styles = useStyles();
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={() => {
        tapPress();
        router.back();
      }}
      hitSlop={12}
      style={styles.backBtn}
      accessibilityRole="button"
      accessibilityLabel={`Go back`}
    >
      <Icon name="chevron-left" size={18} color={palette.ink} />
      <Text style={styles.back}>{label}</Text>
    </Pressable>
  );
}

export function AmbientLiquidGlow({ isDark }: { isDark: boolean }) {
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: "hidden", opacity: 0.45 }]} pointerEvents="none">
      {/* Top luminous ambient light pool - whisper-quiet and diffused */}
      <View
        style={{
          position: "absolute",
          top: -160,
          right: -80,
          width: 420,
          height: 420,
          borderRadius: 210,
          backgroundColor: isDark ? "rgba(16, 185, 129, 0.04)" : "rgba(16, 185, 129, 0.025)",
          transform: [{ scaleX: 1.5 }],
        }}
      />
      {/* Subtle bottom-left soft ambient pool */}
      <View
        style={{
          position: "absolute",
          bottom: -60,
          left: -100,
          width: 380,
          height: 380,
          borderRadius: 190,
          backgroundColor: isDark ? "rgba(255, 255, 255, 0.015)" : "rgba(20, 24, 31, 0.012)",
          transform: [{ scaleY: 1.2 }],
        }}
      />
    </View>
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
  const insets = useSafeAreaInsets();
  const wordmark = useWordmark();
  const { palette } = useTheme();
  const reduceTransparency = useReduceTransparency();
  const isDark = palette.scheme === "dark";
  const [refreshing, setRefreshing] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const setScrollLocked = useCallback((locked: boolean) => {
    setScrollEnabled(!locked);
  }, []);
  function pull() {
    setRefreshing(true);
    Promise.resolve(onRefresh?.()).finally(() => setRefreshing(false));
  }

  // Pinned glass header for secondary screens that provide a back/refresh action
  const hasPinnedNav = !framed && Boolean(refresh);

  const topPadding = framed
    ? insets.top + 58
    : hasPinnedNav
      ? insets.top + 52
      : insets.top + 16;

  const bottomPadding = framed
    ? Math.max(insets.bottom + 88, 110)
    : Math.max(insets.bottom + 24, 40);

  const pinnedNav = hasPinnedNav ? (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        paddingTop: insets.top,
        backgroundColor: reduceTransparency ? palette.bg : palette.navBg,
        borderBottomWidth: 1,
        borderBottomColor: palette.specularBottom || palette.glassBorderSubtle,
        overflow: "hidden",
      }}
    >
      {!reduceTransparency ? (
        <BlurView
          intensity={isDark ? 60 : 80}
          tint={palette.blurTint}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View
        style={{
          minHeight: 46,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
        }}
      >
        <View style={{ minWidth: 60, alignItems: "flex-start", justifyContent: "center" }}>
          {refresh}
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}>
          {title ? (
            <Text
              numberOfLines={1}
              style={{
                fontSize: 17,
                fontWeight: "600",
                color: palette.ink,
                letterSpacing: -0.3,
                fontFamily: title === "Shelf" ? wordmark : undefined,
              }}
            >
              {title}
            </Text>
          ) : null}
        </View>
        <View style={{ minWidth: 60, alignItems: "flex-end", justifyContent: "center" }}>
          {/* Reserve space so title stays centered */}
        </View>
      </View>
    </View>
  ) : null;

  if (!scrollable) {
    return (
      <View style={styles.safe}>
        {!reduceTransparency ? <AmbientLiquidGlow isDark={isDark} /> : null}
        {pinnedNav}
        <ScrollLockProvider value={setScrollLocked}>
          <View style={{ flex: 1, paddingTop: topPadding }}>
            {!hasPinnedNav && !framed && refresh ? <View style={{ paddingHorizontal: 16, marginBottom: -8 }}>{refresh}</View> : null}
            {title ? (
              <View style={[styles.header, { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 6 }]}>
                <View style={{ flexShrink: 1, justifyContent: "center" }}>
                  <Text style={[styles.title, title === "Shelf" ? { fontFamily: wordmark, fontWeight: "600" } : null]}>{title}</Text>
                  {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
                </View>
                {action ? <View style={styles.headerAction}>{action}</View> : null}
              </View>
            ) : null}
            {children}
          </View>
        </ScrollLockProvider>
        {footer}
      </View>
    );
  }

  const body = (
    <View style={styles.safe}>
      {!reduceTransparency ? <AmbientLiquidGlow isDark={isDark} /> : null}
      {pinnedNav}
      <ScrollLockProvider value={setScrollLocked}>
        <ScrollView
          scrollEnabled={scrollEnabled}
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: topPadding, paddingBottom: bottomPadding },
          ]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={pull}
                tintColor={colors.ink}
                progressViewOffset={hasPinnedNav ? insets.top + 46 : framed ? insets.top + 50 : 0}
              />
            ) : undefined
          }
        >
          {!hasPinnedNav && !framed && refresh ? <View style={{ marginBottom: -8 }}>{refresh}</View> : null}
          {title ? (
            <View style={styles.header}>
              <View style={{ flexShrink: 1, justifyContent: "center" }}>
                <Text style={[styles.title, title === "Shelf" ? { fontFamily: wordmark, fontWeight: "600" } : null]}>{title}</Text>
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              </View>
              {action ? <View style={styles.headerAction}>{action}</View> : null}
            </View>
          ) : null}
          {children}
        </ScrollView>
      </ScrollLockProvider>
      {footer}
    </View>
  );
  return body;
}

export function Card({
  children,
  style,
  tone = "default",
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: "default" | "inset" | "glass" | "prominent";
}) {
  const styles = useStyles();
  const isInset = tone === "inset";
  const isProminent = tone === "prominent";

  return (
    <View
      style={[
        styles.card,
        isInset ? styles.cardInset : null,
        isProminent ? styles.cardProminent : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function GlassCard({
  children,
  style,
  tone = "default",
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: "default" | "prominent" | "inset";
}) {
  return (
    <Card tone={tone === "prominent" ? "prominent" : tone === "inset" ? "inset" : "default"} style={style}>
      {children}
    </Card>
  );
}

export function GroupedCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  return <View style={[styles.groupedCard, style]}>{children}</View>;
}

export function GroupedRow({
  icon,
  merchantMark,
  color,
  title,
  subtitle,
  trailing,
  trailingColor,
  onPress,
  divided = false,
  chevron = false,
}: {
  icon?: string;
  merchantMark?: string;
  color?: string | null;
  title: string;
  subtitle?: string;
  trailing?: string;
  trailingColor?: string;
  onPress?: () => void;
  divided?: boolean;
  chevron?: boolean;
}) {
  const styles = useStyles();
  const { palette } = useTheme();

  const body = (
    <View style={styles.ledger}>
      {divided ? <View style={[styles.hairline, { left: merchantMark || icon ? 64 : 16 }]} /> : null}
      {merchantMark ? (
        <MerchantMark name={merchantMark} color={color} />
      ) : icon ? (
        <View style={styles.menuGlyph}>
          <Icon name={icon} size={18} color={palette.ink} />
        </View>
      ) : null}
      <View style={styles.ledgerCopy}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={styles.meta}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? (
        <Text style={[styles.amount, trailingColor ? { color: trailingColor } : null]}>{trailing}</Text>
      ) : null}
      {chevron ? <Icon name="chevron" size={15} color={palette.tertiary} /> : null}
    </View>
  );

  if (!onPress) return body;
  return (
    <PressScale onPress={onPress} pressedStyle={{ backgroundColor: palette.fill }}>
      {body}
    </PressScale>
  );
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
  const { palette } = useTheme();
  const reduceTransparency = useReduceTransparency();
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
        {tone === "quiet" && !reduceTransparency ? (
          <BlurView
            intensity={palette.scheme === "dark" ? 40 : 60}
            tint={palette.blurTint}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
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
    <View style={styles.ledger}>
      {divided ? <View style={[styles.hairline, { left: 64 }]} /> : null}
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
      onPress={() => {
        tapPress();
        onPress();
      }}
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
  return (
    <Pressable
      onPress={() => {
        tapPress();
        onPress();
      }}
    >
      {body}
    </Pressable>
  );
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
    <Pressable
      onPress={() => {
        tapPress();
        onPress();
      }}
      style={({ pressed }) => [styles.ledger, pressed ? { backgroundColor: colors.fill } : null]}
    >
      {divided ? <View style={[styles.hairline, { left: 16 }]} /> : null}
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
    <Pressable
      onPress={() => {
        tapPress();
        onPress();
      }}
      style={({ pressed }) => [styles.ledger, pressed ? { backgroundColor: colors.fill } : null]}
    >
      {divided ? <View style={[styles.hairline, { left: icon ? 62 : 16 }]} /> : null}
      {icon ? (
        <View style={[styles.menuGlyph, active ? { backgroundColor: colors.accentSoft } : null]}>
          <Icon name={icon} size={18} color={danger ? colors.danger : active ? colors.accentInk : colors.ink} />
        </View>
      ) : null}
      <Text style={[styles.rowTitle, { fontWeight: "500", color: danger ? colors.danger : active ? colors.accentInk : colors.ink }]}>{title}</Text>
      {danger ? null : <Icon name="chevron" size={15} color={colors.tertiary} />}
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
  glass = false,
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
  glass?: boolean;
}) {
  const styles = useStyles();
  const { palette } = useTheme();
  const reduceTransparency = useReduceTransparency();
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
    <View style={[styles.hero, glass ? styles.heroGlass : null]}>
      {glass && !reduceTransparency ? (
        <BlurView
          intensity={palette.scheme === "dark" ? 65 : 75}
          tint={palette.blurTint}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
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

export function GlassIconButton({
  icon,
  onPress,
  label,
  size = 34,
  iconSize = 16,
  color,
  active,
}: {
  icon: string;
  onPress: () => void;
  label: string;
  size?: number;
  iconSize?: number;
  color?: string;
  active?: boolean;
}) {
  const styles = useStyles();
  const { palette } = useTheme();
  const reduceTransparency = useReduceTransparency();
  const isDark = palette.scheme === "dark";

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={() => {
        tapPress();
        onPress();
      }}
      style={({ pressed }) => [
        styles.glassIconBtn,
        { width: size, height: size, borderRadius: size / 2 },
        active ? { backgroundColor: palette.accentSoft } : null,
        pressed ? { opacity: 0.75, transform: [{ scale: 0.94 }] } : null,
      ]}
      hitSlop={8}
    >
      {!reduceTransparency && !active ? (
        <BlurView
          intensity={isDark ? 50 : 65}
          tint={palette.blurTint}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <Icon name={icon} size={iconSize} color={color || (active ? palette.accentInk : palette.ink)} />
    </Pressable>
  );
}

export function GlassButton({
  label,
  icon,
  onPress,
  compact = false,
  tone = "default",
}: {
  label: string;
  icon?: string;
  onPress: () => void;
  compact?: boolean;
  tone?: "default" | "primary" | "accent";
}) {
  const styles = useStyles();
  const { palette } = useTheme();
  const reduceTransparency = useReduceTransparency();
  const isDark = palette.scheme === "dark";
  const isPrimary = tone === "primary";
  const isAccent = tone === "accent";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        tapPress();
        onPress();
      }}
      style={({ pressed }) => [
        styles.glassBtn,
        compact ? { minHeight: 32, paddingHorizontal: 10 } : null,
        isPrimary ? { backgroundColor: palette.control } : null,
        isAccent ? { backgroundColor: palette.accentSoft, borderColor: palette.accent } : null,
        pressed ? { opacity: 0.8, transform: [{ scale: 0.96 }] } : null,
      ]}
      hitSlop={8}
    >
      {!reduceTransparency && !isPrimary && !isAccent ? (
        <BlurView
          intensity={isDark ? 50 : 65}
          tint={palette.blurTint}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {icon ? <Icon name={icon} size={compact ? 13 : 15} color={isPrimary ? palette.controlInk : isAccent ? palette.accentInk : palette.ink} /> : null}
      <Text
        style={[
          styles.glassBtnText,
          compact ? { fontSize: 12 } : null,
          isPrimary ? { color: palette.controlInk } : null,
          isAccent ? { color: palette.accentInk } : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function MonthNav({
  year,
  month,
  label,
  onChange,
  compact = false,
}: {
  year: number;
  month: number;
  label?: string;
  onChange: (year: number, month: number) => void;
  compact?: boolean;
}) {
  const styles = useStyles();
  const { palette } = useTheme();
  const reduceTransparency = useReduceTransparency();
  const isDark = palette.scheme === "dark";
  const displayLabel = label ?? (compact ? shortMonthLabel(year, month) : monthLabel(year, month));

  return (
    <View style={styles.monthNav}>
      {!reduceTransparency ? (
        <BlurView
          intensity={isDark ? 50 : 65}
          tint={palette.blurTint}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <Pressable
        accessibilityLabel="Previous month"
        onPress={() => {
          tapSelect();
          const next = shiftMonth(year, month, -1);
          onChange(next.year, next.month);
        }}
        style={({ pressed }) => [styles.monthBtn, pressed ? { backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)" } : null]}
        hitSlop={8}
      >
        <Icon name="chevron-left" size={14} color={palette.ink} />
      </Pressable>
      <View style={styles.monthLabelWrap}>
        <Icon name="calendar" size={12} color={palette.muted} />
        <Text style={styles.monthLabel}>{displayLabel}</Text>
      </View>
      <Pressable
        accessibilityLabel="Next month"
        onPress={() => {
          tapSelect();
          const next = shiftMonth(year, month, 1);
          onChange(next.year, next.month);
        }}
        style={({ pressed }) => [styles.monthBtn, pressed ? { backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)" } : null]}
        hitSlop={8}
      >
        <Icon name="chevron" size={14} color={palette.ink} />
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
  const { palette } = useTheme();
  const reduceTransparency = useReduceTransparency();
  const title = label || "Categorize purchases";
  const desc = subtitle ?? (count ? `${count} ${count === 1 ? "purchase" : "purchases"} to review` : null);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        tapPress();
        onPress();
      }}
      style={({ pressed }) => [styles.banner, pressed ? { opacity: 0.88, transform: [{ scale: 0.985 }] } : null]}
    >
      {!reduceTransparency ? (
        <BlurView
          intensity={palette.scheme === "dark" ? 55 : 70}
          tint={palette.blurTint}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
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

export function SearchField({
  value,
  onChangeText,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  const styles = useStyles();
  const { palette } = useTheme();

  return (
    <View style={styles.searchWrap}>
      <Icon name="search" size={18} color={palette.tertiary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.tertiary}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        style={styles.search}
      />
      {value.length > 0 ? (
        <Pressable
          hitSlop={12}
          onPress={() => {
            tapPress();
            onChangeText("");
          }}
          style={styles.searchClear}
          accessibilityLabel="Clear search text"
        >
          <Icon name="close" size={12} color="#ffffff" />
        </Pressable>
      ) : null}
    </View>
  );
}

export function Sheet({
  title,
  subtitle,
  onClose,
  children,
  height = "80%",
  minHeight = 320,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  height?: number | `${number}%`;
  minHeight?: number | `${number}%`;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const screenHeight = Dimensions.get("window").height;
  const translateY = useRef(new Animated.Value(screenHeight)).current;
  const [closing, setClosing] = useState(false);
  const isClosing = useRef(false);
  const hasClosedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const handleClose = useCallback(() => {
    if (hasClosedRef.current) return;
    hasClosedRef.current = true;
    onCloseRef.current();
  }, []);

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: 0,
      damping: 28,
      stiffness: 340,
      mass: 0.8,
      useNativeDriver: true,
    }).start();

    return () => {
      translateY.stopAnimation();
    };
  }, [translateY]);

  const dismiss = useCallback(() => {
    if (isClosing.current) return;
    isClosing.current = true;
    setClosing(true);
    Keyboard.dismiss();
    tapPress();

    const fallbackTimer = setTimeout(handleClose, 240);

    Animated.timing(translateY, {
      toValue: screenHeight,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      clearTimeout(fallbackTimer);
      handleClose();
    });
  }, [handleClose, screenHeight, translateY]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 4,
        onPanResponderGrant: () => {
          translateY.stopAnimation();
        },
        onPanResponderMove: (_, gestureState) => {
          if (isClosing.current) return;
          if (gestureState.dy > 0) {
            translateY.setValue(gestureState.dy);
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          if (isClosing.current) return;
          if (gestureState.dy > 70 || gestureState.vy > 0.5) {
            dismiss();
          } else {
            Animated.spring(translateY, {
              toValue: 0,
              damping: 28,
              stiffness: 420,
              useNativeDriver: true,
            }).start();
          }
        },
      }),
    [dismiss, translateY],
  );

  const backdropOpacity = translateY.interpolate({
    inputRange: [0, 240],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  return (
    <Modal
      visible
      animationType="none"
      transparent
      onRequestClose={dismiss}
    >
      <View style={styles.sheetWrap} pointerEvents={closing ? "none" : "auto"}>
        <Animated.View style={[styles.sheetBackdrop, { opacity: backdropOpacity }]}>
          <BlurView
            intensity={colors.scheme === "dark" ? 30 : 20}
            tint={colors.scheme === "dark" ? "dark" : "light"}
            style={StyleSheet.absoluteFill}
          />
          <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            minHeight ? { minHeight } : null,
            height ? { height } : null,
            { transform: [{ translateY }] },
          ]}
        >
          <BlurView
            intensity={colors.scheme === "dark" ? 75 : 85}
            tint={colors.blurTint}
            style={StyleSheet.absoluteFill}
          />
          <View style={{ paddingTop: 8, paddingBottom: 6 }}>
            <View
              {...panResponder.panHandlers}
              style={{ paddingVertical: 10, paddingHorizontal: 40, alignSelf: "center" }}
            >
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
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  tapPress();
                  dismiss();
                }}
                hitSlop={16}
                style={({ pressed }) => [
                  styles.sheetDoneBtn,
                  pressed ? { opacity: 0.6 } : null,
                ]}
              >
                <Text style={styles.sheetDoneText}>Done</Text>
              </Pressable>
            </View>
          </View>
          <ScrollView
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom + 24, 40), gap: 14 }}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function PacingCard({
  dailyBudgetCents,
  daysLeft,
  monthName,
  totalPlannedCents,
  spentCents,
  fixedBillsCents,
  discretionaryRemainingCents,
  onPress,
}: {
  dailyBudgetCents: number;
  daysLeft: number;
  monthName?: string;
  totalPlannedCents: number;
  spentCents: number;
  fixedBillsCents: number;
  discretionaryRemainingCents: number;
  onPress?: () => void;
}) {
  const styles = useStyles();
  const { palette } = useTheme();

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const currentDay = Math.min(daysInMonth, Math.max(1, daysInMonth - daysLeft + 1));
  const elapsedRatio = daysInMonth > 0 ? currentDay / daysInMonth : 0;
  const spendRatio = totalPlannedCents > 0 ? spentCents / totalPlannedCents : 0;

  const isOver = discretionaryRemainingCents <= 0 || dailyBudgetCents <= 0;
  const isCaution = !isOver && totalPlannedCents > 0 && spendRatio > elapsedRatio + 0.10;
  const statusLabel = isOver ? "Over Pace" : isCaution ? "Caution" : "On Track";
  const statusColor = isOver ? palette.danger : isCaution ? palette.warn : palette.positive;
  const statusBg = isOver
    ? palette.scheme === "dark"
      ? "rgba(255, 107, 74, 0.16)"
      : "rgba(217, 74, 46, 0.12)"
    : isCaution
      ? palette.scheme === "dark"
        ? "rgba(224, 161, 90, 0.16)"
        : "rgba(196, 122, 26, 0.12)"
      : palette.scheme === "dark"
        ? "rgba(61, 190, 154, 0.16)"
        : "rgba(27, 122, 98, 0.12)";

  const body = (
    <View style={styles.pacingCard}>
      {/* Top Header: Eyebrow + Pulsing Status Pill */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={styles.pacingEyebrow}>SAFE DAILY SPEND</Text>
        <View style={[styles.pacingBadge, { backgroundColor: statusBg }]}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor }} />
          <Text style={[styles.pacingBadgeText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      {/* Main Figure: Safe Daily Allowance */}
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 2 }}>
        <Text style={[styles.pacingFigure, isOver ? { color: palette.danger } : null]}>
          {money(Math.max(0, dailyBudgetCents))}
        </Text>
        <Text style={styles.pacingFigureUnit}>/ day</Text>
      </View>

      {/* Context Sentence */}
      <Text style={styles.pacingCaption}>
        {isOver
          ? `Discretionary pool exhausted with ${daysLeft} days left in ${monthName || "cycle"}. Bills (${money(fixedBillsCents)}) protected.`
          : `${money(discretionaryRemainingCents)} discretionary pool for ${daysLeft} days remaining in ${monthName || "cycle"}. Upcoming bills (${money(fixedBillsCents)}) reserved.`}
      </Text>

      {/* Visual Dual-Marker Pacing Track: Spent vs Calendar Time */}
      {totalPlannedCents > 0 ? (
        <View style={{ gap: 6, marginTop: 4 }}>
          <Progress
            value={spentCents}
            max={totalPlannedCents}
            color={isOver ? palette.danger : isCaution ? palette.warn : palette.accent}
            markerRatio={elapsedRatio}
          />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: 12, color: palette.muted, fontVariant: ["tabular-nums"] }}>
              {`Spent ${money(spentCents)} of ${money(totalPlannedCents)}`}
            </Text>
            <Text style={{ fontSize: 12, color: palette.muted, fontVariant: ["tabular-nums"] }}>
              {`Day ${currentDay} of ${daysInMonth} (${Math.round(elapsedRatio * 100)}%)`}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Dual-Pool Inset Metrics */}
      <View style={styles.pacingBreakdown}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.pacingMetricLabel}>Discretionary</Text>
          <Text style={[styles.pacingMetricValue, isOver ? { color: palette.danger } : null]}>
            {money(discretionaryRemainingCents)}
          </Text>
        </View>
        <View style={styles.pacingDivider} />
        <View style={{ flex: 1, gap: 2, paddingLeft: 12 }}>
          <Text style={styles.pacingMetricLabel}>Upcoming Bills</Text>
          <Text style={styles.pacingMetricValue}>{money(fixedBillsCents)}</Text>
        </View>
        <View style={styles.pacingDivider} />
        <View style={{ flex: 1, gap: 2, paddingLeft: 12 }}>
          <Text style={styles.pacingMetricLabel}>Total Budget</Text>
          <Text style={styles.pacingMetricValue}>{money(totalPlannedCents)}</Text>
        </View>
      </View>
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Safe daily spend ${money(dailyBudgetCents)} per day, tap to view plan`}
      style={({ pressed }) => (pressed ? { opacity: 0.9, transform: [{ scale: 0.985 }] } : null)}
    >
      {body}
    </Pressable>
  );
}

export function QuickLogModal({
  visible,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const reduceTransparency = useReduceTransparency();
  const isDark = palette.scheme === "dark";

  const [cents, setCents] = useState(0);
  const [isIncome, setIsIncome] = useState(false);
  const [merchant, setMerchant] = useState("");
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string; color: string }[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [accountId, setAccountId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setCents(0);
    setIsIncome(false);
    setMerchant("");
    setError(null);
    setBusy(false);

    const cachedCats = peek<{ groups: { name: string; categories: { id: string; name: string; color?: string | null }[] }[] }>("/api/categories");
    if (cachedCats?.groups) {
      const flat = cachedCats.groups.flatMap((g) => g.categories).map((c) => ({ id: c.id, name: c.name, color: shelfColor(c.color) }));
      setCategories(flat);
      if (flat[0]) setSelectedCatId(flat[0].id);
    } else {
      void api<{ groups: { name: string; categories: { id: string; name: string; color?: string | null }[] }[] }>("/api/categories")
        .then((res) => {
          const flat = res.groups.flatMap((g) => g.categories).map((c) => ({ id: c.id, name: c.name, color: shelfColor(c.color) }));
          setCategories(flat);
          if (flat[0]) setSelectedCatId(flat[0].id);
        })
        .catch(() => undefined);
    }

    const cachedAccts = peek<{ accounts: { id: string; name: string }[] }>("/api/accounts");
    if (cachedAccts?.accounts?.length) {
      setAccounts(cachedAccts.accounts);
      setAccountId(cachedAccts.accounts[0].id);
    } else {
      void api<{ accounts: { id: string; name: string }[] }>("/api/accounts")
        .then((res) => {
          setAccounts(res.accounts);
          if (res.accounts[0]) setAccountId(res.accounts[0].id);
        })
        .catch(() => undefined);
    }
  }, [visible]);

  function handleKey(key: string) {
    tapSelect();
    if (key === "clear") {
      setCents(0);
      return;
    }
    if (key === "back") {
      setCents((c) => Math.floor(c / 10));
      return;
    }
    const digit = parseInt(key, 10);
    if (!isNaN(digit)) {
      setCents((c) => {
        if (c > 9999999) return c;
        return c * 10 + digit;
      });
    }
  }

  async function handleSave() {
    if (cents <= 0) return;
    setBusy(true);
    setError(null);
    try {
      const chosenCat = categories.find((c) => c.id === selectedCatId);
      const label = merchant.trim() || chosenCat?.name || (isIncome ? "Income" : "Expense");
      const signedDollars = (cents / 100) * (isIncome ? -1 : 1);

      await api("/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          name: label,
          amount: signedDollars,
          date: todayISO(),
          categoryId: selectedCatId || undefined,
          accountId: accountId || undefined,
        }),
      });

      celebrate(isIncome ? "Income logged" : "Expense logged");
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log charge");
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return null;

  const quickPillCats = categories.slice(0, 8);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "rgba(0,0,0,0.68)" : "rgba(15,23,42,0.36)" }]}
          onPress={onClose}
        >
          {!reduceTransparency ? (
            <BlurView intensity={isDark ? 25 : 18} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
          ) : null}
        </Pressable>

        <View
          style={{
            backgroundColor: reduceTransparency ? palette.card : palette.sheetBg,
            borderTopLeftRadius: 32,
            borderTopRightRadius: 32,
            borderCurve: "continuous",
            borderTopWidth: 1,
            borderTopColor: palette.specularTop || "rgba(255,255,255,0.4)",
            overflow: "hidden",
            paddingBottom: Math.max(insets.bottom + 12, 28),
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -12 },
            shadowOpacity: isDark ? 0.6 : 0.16,
            shadowRadius: 28,
            elevation: 24,
          }}
        >
          {!reduceTransparency ? (
            <BlurView intensity={isDark ? 75 : 85} tint={palette.blurTint} style={StyleSheet.absoluteFill} />
          ) : null}

          <View style={{ width: 36, height: 5, borderRadius: 99, backgroundColor: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.2)", alignSelf: "center", marginTop: 10, marginBottom: 8 }} />

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 10 }}>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={{ fontSize: 16, color: palette.muted, fontWeight: "500" }}>Cancel</Text>
            </Pressable>

            <View style={{ flexDirection: "row", backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)", borderRadius: 99, padding: 3 }}>
              <Pressable
                onPress={() => {
                  tapSelect();
                  setIsIncome(false);
                }}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 5,
                  borderRadius: 99,
                  backgroundColor: !isIncome ? palette.control : "transparent",
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: !isIncome ? palette.controlInk : palette.muted }}>
                  Expense
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  tapSelect();
                  setIsIncome(true);
                }}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 5,
                  borderRadius: 99,
                  backgroundColor: isIncome ? palette.positive : "transparent",
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: isIncome ? "#ffffff" : palette.muted }}>
                  Income
                </Text>
              </Pressable>
            </View>

            <View style={{ width: 50 }} />
          </View>

          <View style={{ alignItems: "center", paddingVertical: 10 }}>
            <Text
              style={{
                fontSize: 48,
                fontWeight: "700",
                letterSpacing: -2,
                color: isIncome ? palette.positive : palette.ink,
                fontVariant: ["tabular-nums"],
              }}
            >
              {isIncome && cents > 0 ? "+" : ""}{money(cents)}
            </Text>
          </View>

          <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)",
                borderRadius: 14,
                borderCurve: "continuous",
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderWidth: 1,
                borderColor: palette.line,
              }}
            >
              <Icon name="pencil" size={15} color={palette.tertiary} />
              <TextInput
                value={merchant}
                onChangeText={setMerchant}
                placeholder="Merchant or description (optional)"
                placeholderTextColor={palette.tertiary}
                style={{ flex: 1, fontSize: 15, color: palette.ink, marginLeft: 8, padding: 0 }}
                autoCapitalize="sentences"
              />
              {merchant ? (
                <Pressable onPress={() => setMerchant("")} hitSlop={8}>
                  <Icon name="close" size={14} color={palette.tertiary} />
                </Pressable>
              ) : null}
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingBottom: 12 }}
          >
            {quickPillCats.map((cat) => {
              const selected = selectedCatId === cat.id;
              return (
                <Pressable
                  key={cat.id}
                  onPress={() => {
                    tapSelect();
                    setSelectedCatId(cat.id);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 99,
                    borderCurve: "continuous",
                    backgroundColor: selected ? (isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.1)") : isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                    borderWidth: 1,
                    borderColor: selected ? (cat.color || palette.accent) : "transparent",
                  }}
                >
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cat.color || palette.accent }} />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: selected ? "700" : "500",
                      color: selected ? palette.ink : palette.muted,
                    }}
                  >
                    {cat.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {error ? (
            <Text style={{ textAlign: "center", color: palette.danger, fontSize: 13, marginBottom: 8, paddingHorizontal: 20 }}>
              {error}
            </Text>
          ) : null}

          <View style={{ paddingHorizontal: 20, gap: 8 }}>
            {[
              ["1", "2", "3"],
              ["4", "5", "6"],
              ["7", "8", "9"],
              ["clear", "0", "back"],
            ].map((row, rIdx) => (
              <View key={rIdx} style={{ flexDirection: "row", gap: 8 }}>
                {row.map((k) => (
                  <Pressable
                    key={k}
                    onPress={() => handleKey(k)}
                    style={({ pressed }) => [
                      {
                        flex: 1,
                        height: 48,
                        borderRadius: 14,
                        borderCurve: "continuous",
                        backgroundColor: isDark
                          ? (k === "clear" || k === "back" ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.12)")
                          : (k === "clear" || k === "back" ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.92)"),
                        alignItems: "center",
                        justifyContent: "center",
                        borderWidth: 1,
                        borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: isDark ? 0.2 : 0.04,
                        shadowRadius: 3,
                        elevation: 1,
                      },
                      pressed ? { transform: [{ scale: 0.94 }], opacity: 0.75 } : null,
                    ]}
                  >
                    {k === "back" ? (
                      <Icon name="chevron-left" size={18} color={palette.ink} />
                    ) : k === "clear" ? (
                      <Text style={{ fontSize: 15, fontWeight: "600", color: palette.muted }}>C</Text>
                    ) : (
                      <Text style={{ fontSize: 22, fontWeight: "600", color: palette.ink, fontVariant: ["tabular-nums"] }}>
                        {k}
                      </Text>
                    )}
                  </Pressable>
                ))}
              </View>
            ))}
          </View>

          <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
            <Pressable
              onPress={handleSave}
              disabled={busy || cents <= 0}
              style={({ pressed }) => [
                {
                  height: 52,
                  borderRadius: 18,
                  borderCurve: "continuous",
                  backgroundColor: cents > 0 ? (isIncome ? palette.positive : palette.control) : isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: cents > 0 ? (isDark ? 0.35 : 0.15) : 0,
                  shadowRadius: 10,
                  elevation: cents > 0 ? 3 : 0,
                },
                pressed ? { transform: [{ scale: 0.98 }], opacity: 0.88 } : null,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={palette.controlInk} />
              ) : (
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "700",
                    color: cents > 0 ? palette.controlInk : palette.tertiary,
                    letterSpacing: -0.3,
                  }}
                >
                  {cents > 0 ? `Save ${isIncome ? "Income" : "Expense"} (${money(cents)})` : "Enter an amount"}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: Palette) {
  const isDark = colors.scheme === "dark";
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    scroll: { padding: 16, paddingBottom: 100, gap: 20 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      minHeight: 40,
      marginBottom: 2,
    },
    headerAction: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    backBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      minHeight: 44,
      paddingRight: 12,
      marginLeft: -4,
    },
    back: { color: colors.ink, fontSize: 16, fontWeight: "500", letterSpacing: -0.2 },
    title: { fontSize: 26, fontWeight: "700", letterSpacing: -0.7, color: colors.ink },
    subtitle: { marginTop: 2, fontSize: 13, lineHeight: 18, color: colors.muted, letterSpacing: -0.1 },
    card: {
      backgroundColor: colors.card,
      borderRadius: 20,
      borderCurve: "continuous",
      borderWidth: 1,
      borderColor: colors.line,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOpacity: isDark ? 0.22 : 0.03,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 3 },
      elevation: 2,
    },
    cardProminent: {
      borderColor: colors.lineStrong,
      shadowOpacity: isDark ? 0.32 : 0.06,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 5 },
      elevation: 3,
    },
    groupedCard: {
      backgroundColor: colors.card,
      borderRadius: 18,
      borderCurve: "continuous",
      borderWidth: 1,
      borderColor: colors.line,
      overflow: "hidden",
    },
    glassCard: {
      backgroundColor: colors.glass,
      borderRadius: 22,
      borderCurve: "continuous",
      borderWidth: 1,
      borderTopColor: colors.specularTop || colors.glassBorder,
      borderBottomColor: colors.specularBottom || colors.glassBorderSubtle,
      borderLeftColor: colors.specularSides || colors.glassBorderSubtle,
      borderRightColor: colors.specularSides || colors.glassBorderSubtle,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOpacity: isDark ? 0.35 : 0.06,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    glassProminent: {
      backgroundColor: colors.glassProminent,
      borderTopColor: colors.specularTop || colors.glassBorder,
      shadowOpacity: isDark ? 0.45 : 0.08,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 10 },
      elevation: 5,
    },
    cardInset: {
      backgroundColor: colors.cardInset,
      borderColor: colors.line,
      borderCurve: "continuous",
    },
    field: { gap: 6 },
    label: { fontSize: 13, fontWeight: "600", color: colors.muted, letterSpacing: -0.1 },
    input: {
      backgroundColor: isDark ? "rgba(24, 28, 36, 0.85)" : "rgba(235, 238, 242, 0.85)",
      borderRadius: 14,
      borderCurve: "continuous",
      borderWidth: 1,
      borderColor: colors.line,
      paddingHorizontal: 15,
      paddingVertical: 13,
      fontSize: 16,
      color: colors.ink,
    },
    multiline: { minHeight: 120, textAlignVertical: "top" },
    button: {
      alignSelf: "flex-start",
      backgroundColor: colors.control,
      borderRadius: 999,
      borderCurve: "continuous",
      minHeight: 46,
      paddingHorizontal: 20,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: isDark ? 0.25 : 0.1,
      shadowRadius: 8,
      elevation: 2,
    },
    buttonBlock: { alignSelf: "stretch" },
    quiet: {
      backgroundColor: colors.glass,
      borderWidth: 1,
      borderTopColor: colors.specularTop || colors.glassBorder,
      borderBottomColor: colors.specularBottom || colors.glassBorderSubtle,
      borderLeftColor: colors.specularSides || colors.glassBorderSubtle,
      borderRightColor: colors.specularSides || colors.glassBorderSubtle,
      shadowOpacity: isDark ? 0.15 : 0.04,
      overflow: "hidden",
    },
    danger: { backgroundColor: colors.danger },
    buttonText: { color: colors.controlInk, fontSize: 15, fontWeight: "600", letterSpacing: -0.2 },
    quietText: { color: colors.ink },
    row: {
      backgroundColor: colors.glass,
      borderRadius: 20,
      borderCurve: "continuous",
      borderWidth: 1,
      borderColor: colors.line,
      paddingHorizontal: 16,
      minHeight: 56,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      shadowColor: "#000",
      shadowOpacity: isDark ? 0.2 : 0.03,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
    },
    section: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: -4, marginTop: 4 },
    sectionTitle: { fontSize: 13, fontWeight: "600", color: colors.muted, letterSpacing: -0.1, textTransform: "uppercase" },
    sectionTrail: { fontSize: 15, fontWeight: "600", color: colors.ink, letterSpacing: -0.3, fontVariant: ["tabular-nums"] },
    sectionAction: { fontSize: 15, fontWeight: "600", color: colors.accentInk, letterSpacing: -0.2 },
    ledger: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minHeight: 58,
      paddingHorizontal: 16,
      paddingVertical: 11,
      position: "relative",
    },
    hairline: {
      position: "absolute",
      top: 0,
      right: 0,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.line,
    },
    menuGlyph: { width: 34, height: 34, borderRadius: 10, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.fill },
    divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
    ledgerCopy: { flex: 1, gap: 2 },
    meta: { fontSize: 13, color: colors.tertiary, letterSpacing: -0.1 },
    amount: { fontSize: 16, fontWeight: "600", color: colors.ink, letterSpacing: -0.3, fontVariant: ["tabular-nums"] },
    rowTitle: { flex: 1, fontSize: 16, fontWeight: "500", color: colors.ink, letterSpacing: -0.2 },
    rowDetail: { fontSize: 15, color: colors.muted, letterSpacing: -0.1 },
    note: { color: colors.muted, fontSize: 15, lineHeight: 21, letterSpacing: -0.1 },
    loading: { paddingVertical: 24, alignItems: "center", gap: 8 },
    hero: {
      backgroundColor: colors.card,
      borderRadius: 24,
      borderCurve: "continuous",
      borderWidth: 1,
      borderColor: colors.line,
      overflow: "hidden",
      paddingTop: 20,
      paddingHorizontal: 20,
      shadowColor: "#000",
      shadowOpacity: isDark ? 0.28 : 0.04,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
    heroGlass: {
      backgroundColor: colors.glassProminent,
      borderTopColor: colors.specularTop || colors.glassBorder,
      borderBottomColor: colors.specularBottom || colors.glassBorderSubtle,
      borderLeftColor: colors.specularSides || colors.glassBorderSubtle,
      borderRightColor: colors.specularSides || colors.glassBorderSubtle,
      shadowOpacity: isDark ? 0.45 : 0.08,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 10 },
      elevation: 5,
    },
    pacingCard: {
      backgroundColor: colors.card,
      borderRadius: 24,
      borderCurve: "continuous",
      borderWidth: 1,
      borderColor: colors.line,
      padding: 20,
      gap: 12,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOpacity: isDark ? 0.28 : 0.04,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 5 },
      elevation: 3,
    },
    pacingEyebrow: {
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.8,
      color: colors.muted,
      textTransform: "uppercase",
    },
    pacingBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 99,
      borderCurve: "continuous",
    },
    pacingBadgeText: {
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: -0.1,
    },
    pacingFigure: {
      fontSize: 42,
      fontWeight: "700",
      letterSpacing: -1.6,
      color: colors.ink,
      fontVariant: ["tabular-nums"],
    },
    pacingFigureUnit: {
      fontSize: 18,
      fontWeight: "500",
      color: colors.muted,
      letterSpacing: -0.3,
    },
    pacingCaption: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.muted,
      letterSpacing: -0.1,
    },
    pacingBreakdown: {
      flexDirection: "row",
      alignItems: "center",
      paddingTop: 12,
      marginTop: 4,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
    },
    pacingMetricLabel: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.tertiary,
      letterSpacing: -0.1,
      textTransform: "uppercase",
    },
    pacingMetricValue: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.ink,
      fontVariant: ["tabular-nums"],
      letterSpacing: -0.2,
      marginTop: 2,
    },
    pacingDivider: {
      width: StyleSheet.hairlineWidth,
      height: 28,
      backgroundColor: colors.line,
    },
    heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    heroLabel: { fontSize: 13, fontWeight: "600", color: colors.muted, letterSpacing: -0.1, textTransform: "uppercase" },
    heroFigure: { marginTop: 4, fontSize: 46, fontWeight: "700", letterSpacing: -2, color: colors.ink, fontVariant: ["tabular-nums"] },
    heroEmpty: { fontSize: 28, fontWeight: "500", letterSpacing: -0.6, color: colors.muted },
    heroFooter: { marginHorizontal: -20, marginTop: 14, paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, fontSize: 13, color: colors.muted },
    status: { fontSize: 13, fontWeight: "600", color: colors.muted },
    chartTag: { position: "absolute", fontSize: 10, fontWeight: "700", letterSpacing: 1, color: colors.tertiary, textTransform: "uppercase" },
    facts: {
      marginHorizontal: -20,
      marginTop: 6,
      paddingHorizontal: 20,
      paddingTop: 14,
      paddingBottom: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
      flexDirection: "row",
      gap: 12,
    },
    kicker: { fontSize: 12, fontWeight: "600", color: colors.tertiary, letterSpacing: -0.1, textTransform: "uppercase" },
    factValue: { fontSize: 16, fontWeight: "600", letterSpacing: -0.3, color: colors.ink, fontVariant: ["tabular-nums"] },
    mix: { flexDirection: "row", height: 8, gap: 2, backgroundColor: colors.fill, borderRadius: 99, overflow: "hidden" },
    track: { height: 6, borderRadius: 99, backgroundColor: colors.fill, overflow: "hidden" },
    monthNav: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.glass,
      borderRadius: 19,
      borderCurve: "continuous",
      borderWidth: 1,
      borderTopColor: colors.specularTop || colors.glassBorder,
      borderBottomColor: colors.specularBottom || colors.glassBorderSubtle,
      borderLeftColor: colors.specularSides || colors.glassBorderSubtle,
      borderRightColor: colors.specularSides || colors.glassBorderSubtle,
      paddingHorizontal: 4,
      paddingVertical: 2,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOpacity: isDark ? 0.25 : 0.05,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    monthBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    monthChevron: { fontSize: 18, lineHeight: 20, color: colors.ink },
    monthLabelWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 7,
    },
    monthLabel: {
      fontSize: 13,
      fontWeight: "600",
      letterSpacing: -0.2,
      color: colors.ink,
      fontVariant: ["tabular-nums"],
    },
    glassBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      minHeight: 34,
      paddingHorizontal: 12,
      borderRadius: 17,
      borderCurve: "continuous",
      borderWidth: 1,
      borderTopColor: colors.specularTop || colors.glassBorder,
      borderBottomColor: colors.specularBottom || colors.glassBorderSubtle,
      borderLeftColor: colors.specularSides || colors.glassBorderSubtle,
      borderRightColor: colors.specularSides || colors.glassBorderSubtle,
      backgroundColor: colors.glass,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOpacity: isDark ? 0.25 : 0.05,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    glassBtnText: {
      fontSize: 13,
      fontWeight: "600",
      letterSpacing: -0.2,
      color: colors.ink,
    },
    glassIconBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderCurve: "continuous",
      borderWidth: 1,
      borderTopColor: colors.specularTop || colors.glassBorder,
      borderBottomColor: colors.specularBottom || colors.glassBorderSubtle,
      borderLeftColor: colors.specularSides || colors.glassBorderSubtle,
      borderRightColor: colors.specularSides || colors.glassBorderSubtle,
      backgroundColor: colors.glass,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      shadowColor: "#000",
      shadowOpacity: isDark ? 0.25 : 0.05,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    banner: {
      minHeight: 60,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 22,
      borderCurve: "continuous",
      borderWidth: 1,
      borderTopColor: colors.specularTop || colors.glassBorder,
      borderBottomColor: colors.specularBottom || colors.glassBorderSubtle,
      borderLeftColor: colors.specularSides || colors.glassBorderSubtle,
      borderRightColor: colors.specularSides || colors.glassBorderSubtle,
      backgroundColor: colors.glass,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOpacity: isDark ? 0.3 : 0.05,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 5 },
      elevation: 3,
    },
    bannerIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 12,
      borderCurve: "continuous",
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
      letterSpacing: -0.1,
    },
    bannerBadge: {
      paddingHorizontal: 9,
      paddingVertical: 3,
      borderRadius: 99,
      backgroundColor: colors.fill,
    },
    bannerBadgeText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.ink,
      fontVariant: ["tabular-nums"],
    },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.glass,
      borderRadius: 16,
      borderCurve: "continuous",
      borderWidth: 1,
      borderTopColor: colors.specularTop || colors.glassBorder,
      borderBottomColor: colors.specularBottom || colors.glassBorderSubtle,
      borderLeftColor: colors.specularSides || colors.glassBorderSubtle,
      borderRightColor: colors.specularSides || colors.glassBorderSubtle,
      minHeight: 44,
      paddingHorizontal: 14,
      gap: 10,
      shadowColor: "#000",
      shadowOpacity: isDark ? 0.2 : 0.04,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    search: {
      flex: 1,
      fontSize: 16,
      color: colors.ink,
      paddingVertical: 10,
    },
    searchClear: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.tertiary,
      alignItems: "center",
      justifyContent: "center",
    },
    sheetWrap: { flex: 1, justifyContent: "flex-end" },
    sheetBackdrop: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: isDark ? "rgba(0, 0, 0, 0.65)" : "rgba(15, 23, 42, 0.35)",
      overflow: "hidden",
    },
    sheet: {
      maxHeight: "88%",
      backgroundColor: colors.sheetBg,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      borderCurve: "continuous",
      borderTopWidth: 1,
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.specularTop || colors.glassBorder,
      borderLeftColor: colors.glassBorderSubtle,
      borderRightColor: colors.glassBorderSubtle,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: -10 },
      shadowOpacity: isDark ? 0.65 : 0.16,
      shadowRadius: 28,
      elevation: 24,
      overflow: "hidden",
    },
    handle: {
      width: 36,
      height: 5,
      borderRadius: 99,
      backgroundColor: isDark ? "rgba(255, 255, 255, 0.35)" : "rgba(0, 0, 0, 0.2)",
      alignSelf: "center",
      marginTop: 4,
    },
    sheetHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingHorizontal: 18,
      paddingTop: 8,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line,
    },
    sheetTitle: { fontSize: 17, fontWeight: "600", letterSpacing: -0.3, color: colors.ink },
    sheetSubtitle: { fontSize: 13, fontWeight: "500", color: colors.muted, marginTop: 1 },
    sheetDoneBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 99,
      backgroundColor: colors.accentSoft,
    },
    sheetDoneText: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.accentInk,
      letterSpacing: -0.2,
    },
    switch: {
      width: 51,
      height: 31,
      borderRadius: 999,
      backgroundColor: isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(120, 120, 128, 0.16)",
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
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    knobOn: { transform: [{ translateX: 20 }] },
    segment: {
      position: "relative",
      minHeight: 42,
      padding: 3,
      borderRadius: 999,
      borderCurve: "continuous",
      backgroundColor: isDark ? "rgba(38, 43, 52, 0.7)" : "rgba(224, 229, 235, 0.75)",
      flexDirection: "row",
    },
    segmentThumb: {
      position: "absolute",
      top: 3,
      bottom: 3,
      borderRadius: 999,
      borderCurve: "continuous",
      backgroundColor: colors.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.specularTop || colors.glassBorder,
      borderBottomColor: colors.line,
      borderLeftColor: colors.line,
      borderRightColor: colors.line,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.12,
      shadowRadius: 5,
      elevation: 2,
    },
    segmentItem: { flex: 1, minHeight: 36, alignItems: "center", justifyContent: "center" },
    segmentLabel: { fontSize: 13, fontWeight: "600", color: colors.muted, letterSpacing: -0.1 },
  });
}
