import { router, useFocusEffect } from "expo-router";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
import { dashboardPath, flowMoney, money, monthLabel, sameMerchant, shiftMonth, shortMonthLabel, todayISO, shelfColor } from "./format";
import { tapPress, tapSelect, tapSuccess } from "./haptic";
import { Icon, MerchantMark } from "./icons";
import { BlurView } from "expo-blur";
import { colors, useReduceMotion, useReduceTransparency, useTheme, type Palette } from "./theme";
import { api, load, peek } from "./api";
import * as SecureStore from "expo-secure-store";
import { celebrate } from "./toast";
import { dropQuickLog, mergeBudget, mergeDashboard, settleQuickLog, stageQuickLog, type QuickLog } from "./live-edits";
import {
  anchorRect,
  chartOpacity,
  FlightRun,
  flightSurface,
  playFlight,
  useFlightHidden,
  useMeasuredAnchor,
  type FlightPiece,
  type FlightRect,
} from "./flight";
import Svg, { Circle } from "react-native-svg";

export { GroupedBars, SpendChart };

export { colors };

function useStyles() {
  const { palette } = useTheme();
  return useMemo(() => makeStyles(palette), [palette]);
}

export function Back({ label = "Back", onPress }: { label?: string; onPress?: () => void }) {
  const styles = useStyles();
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={() => {
        tapPress();
        if (onPress) onPress();
        else router.back();
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
  titleAnchor,
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
  titleAnchor?: string;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const wordmark = useWordmark();
  const { palette } = useTheme();
  const reduceTransparency = useReduceTransparency();
  const reduceMotion = useReduceMotion();
  const isDark = palette.scheme === "dark";
  const [refreshing, setRefreshing] = useState(false);
  const bodyFade = useRef(new Animated.Value(1)).current;
  const sawFocus = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!framed) return;
      if (!sawFocus.current) {
        sawFocus.current = true;
        return;
      }
      if (reduceMotion) {
        bodyFade.setValue(1);
        return;
      }
      bodyFade.setValue(0);
      Animated.timing(bodyFade, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }, [framed, reduceMotion, bodyFade]),
  );
  const titleMeasure = useMeasuredAnchor(titleAnchor, title ? { text: title, color: palette.ink, fontSize: 17 } : null);
  const titleOpacity = useFlightHidden(titleAnchor);
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
    ? insets.top + 52 + 12
    : hasPinnedNav
      ? insets.top + 52 + 12
      : insets.top + 24;

  const bottomPadding = framed
    ? Math.max(insets.bottom + 100, 120)
    : Math.max(insets.bottom + 32, 48);

  // Tab screens get their title from the pinned tab header, so only their actions show here.
  const toolbar = framed && action ? <View style={styles.toolbar}>{action}</View> : null;

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
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: palette.line,
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
      <View style={{ height: 52, justifyContent: "center", alignItems: "center" }}>
        {title ? (
          <View
            pointerEvents="none"
            ref={titleMeasure.ref}
            onLayout={titleMeasure.onLayout}
            collapsable={false}
            style={{ opacity: titleOpacity, maxWidth: "52%", alignItems: "center" }}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={{
                textAlign: "center",
                fontSize: 17,
                fontWeight: "600",
                color: palette.ink,
                letterSpacing: -0.3,
                fontFamily: title === "Shelf" ? wordmark : undefined,
              }}
            >
              {title}
            </Text>
          </View>
        ) : null}
        <View style={{ position: "absolute", left: 8, top: 0, bottom: 0, justifyContent: "center", maxWidth: "42%" }}>
          {refresh}
        </View>
        <View style={{ position: "absolute", right: 12, top: 0, bottom: 0, justifyContent: "center", maxWidth: "42%", alignItems: "flex-end" }}>
          {action}
        </View>
      </View>
    </View>
  ) : null;

  if (!scrollable) {
    return (
      <Animated.View style={[styles.safe, { opacity: bodyFade }]}>
        {pinnedNav}
        <ScrollLockProvider value={setScrollLocked}>
          <View style={{ flex: 1, paddingTop: topPadding }}>
            {!hasPinnedNav && !framed && refresh ? <View style={{ paddingHorizontal: 16, marginBottom: -8 }}>{refresh}</View> : null}
            {toolbar ? <View style={{ paddingHorizontal: 16 }}>{toolbar}</View> : null}
            {hasPinnedNav ? (
              subtitle ? <Text style={[styles.subtitle, { paddingHorizontal: 16, marginBottom: 8 }]}>{subtitle}</Text> : null
            ) : title && !framed ? (
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
      </Animated.View>
    );
  }

  const body = (
    <Animated.View style={[styles.safe, { opacity: bodyFade }]}>
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
                progressViewOffset={hasPinnedNav || framed ? insets.top + 52 : 0}
              />
            ) : undefined
          }
        >
          {!hasPinnedNav && !framed && refresh ? <View style={{ marginBottom: -8 }}>{refresh}</View> : null}
          {toolbar}
          {hasPinnedNav ? (
            subtitle ? <Text style={[styles.subtitle, { marginBottom: 8 }]}>{subtitle}</Text> : null
          ) : title && !framed ? (
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
    </Animated.View>
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
  const styles = useStyles();
  const { palette } = useTheme();
  const reduceTransparency = useReduceTransparency();
  const isDark = palette.scheme === "dark";
  const isProminent = tone === "prominent";

  return (
    <View
      style={[
        styles.glassCard,
        isProminent ? styles.glassProminent : null,
        style,
      ]}
    >
      {!reduceTransparency ? (
        <BlurView
          intensity={isDark ? (isProminent ? 75 : 60) : (isProminent ? 85 : 75)}
          tint={palette.blurTint}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {children}
    </View>
  );
}

export function ProgressRing({
  size = 56,
  strokeWidth = 5,
  progress = 0,
  color,
  trackColor,
  children,
  style,
}: {
  size?: number;
  strokeWidth?: number;
  progress?: number;
  color?: string;
  trackColor?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette } = useTheme();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedProgress = Math.max(0, Math.min(progress, 1));
  const strokeDashoffset = circumference - clampedProgress * circumference;
  const strokeColor = color || (progress > 1 ? palette.danger : palette.accent);
  const bgTrack = trackColor || (palette.scheme === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)");

  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={bgTrack}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
      {children}
    </View>
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
  const { palette } = useTheme();
  const [shown, setShown] = useState(false);
  const secret = Boolean(secureTextEntry || shelfKey);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secret && !shown}
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
          style={[styles.input, { flex: 1 }, multiline ? styles.multiline : null]}
          placeholderTextColor={colors.tertiary}
        />
        {shelfKey ? (
          <Pressable
            onPress={() => setShown((open) => !open)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={shown ? "Hide Shelf key" : "Show Shelf key"}
          >
            <Text style={{ color: palette.accentInk, fontWeight: "600", fontSize: 15 }}>{shown ? "Hide" : "Show"}</Text>
          </Pressable>
        ) : null}
      </View>
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

/** Section headers are page titles on a screen and quiet labels inside a sheet or a dated list. */
const SectionSize = createContext<"large" | "small">("large");
export const SmallSections = SectionSize.Provider;

export function Section({
  title,
  action,
  onAction,
  trailing,
  size,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  trailing?: string;
  size?: "large" | "small";
}) {
  const styles = useStyles();
  const inherited = useContext(SectionSize);
  const small = (size ?? inherited) === "small";
  return (
    <View style={[styles.section, small ? styles.sectionSmall : null]}>
      <Text accessibilityRole="header" style={small ? styles.sectionTitleSmall : styles.sectionTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 12 }}>
        {trailing ? <Text style={small ? styles.sectionTrailSmall : styles.sectionTrail}>{trailing}</Text> : null}
        {action && onAction ? (
          <Pressable onPress={onAction} hitSlop={12} accessibilityRole="button">
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
  rowAnchor,
  amountAnchor,
}: {
  name: string;
  meta?: string;
  amount: string;
  amountColor?: string;
  color?: string | null;
  onPress?: () => void;
  divided?: boolean;
  rowAnchor?: string;
  amountAnchor?: string;
}) {
  const styles = useStyles();
  const rowMeasure = useMeasuredAnchor(rowAnchor, { text: name, color: amountColor ?? colors.ink, fontSize: 16 });
  const amountMeasure = useMeasuredAnchor(amountAnchor, { text: amount, color: amountColor ?? colors.ink, fontSize: 16 });
  const rowOpacity = useFlightHidden(rowAnchor);
  const body = (
    <View ref={rowMeasure.ref} onLayout={rowMeasure.onLayout} collapsable={false} style={[styles.ledger, { opacity: rowOpacity }]}>
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
      <View ref={amountMeasure.ref} onLayout={amountMeasure.onLayout} collapsable={false}>
        <Text style={[styles.amount, amountColor ? { color: amountColor } : null]}>{amount}</Text>
      </View>
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
  return (
    <Pressable
      onPress={() => {
        tapPress();
        onPress();
      }}
      style={({ pressed }) => (pressed ? pressedStyle : null)}
    >
      {children}
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

export function MenuRow({
  title,
  subtitle,
  icon,
  onPress,
  divided,
  danger,
  active,
  compact,
  trailing,
}: {
  title: string;
  subtitle?: string;
  icon?: string;
  onPress: () => void;
  divided?: boolean;
  danger?: boolean;
  active?: boolean;
  /** Shorter row when the line has no secondary copy. */
  compact?: boolean;
  trailing?: ReactNode;
}) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={() => {
        tapPress();
        onPress();
      }}
      style={({ pressed }) => [styles.ledger, compact ? styles.ledgerCompact : null, pressed ? { backgroundColor: colors.fill } : null]}
    >
      {divided ? <View style={[styles.hairline, { left: icon ? 62 : 16 }]} /> : null}
      {icon ? (
        <View style={[styles.menuGlyph, active ? { backgroundColor: colors.accentSoft } : null]}>
          <Icon name={icon} size={18} color={danger ? colors.danger : active ? colors.accentInk : colors.ink} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.rowTitle, { flex: 0, fontWeight: "500", color: danger ? colors.danger : active ? colors.accentInk : colors.ink }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={styles.meta}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
      {danger ? null : <Icon name="chevron" size={15} color={colors.tertiary} />}
    </Pressable>
  );
}

export function Note({ children, tone }: { children: string; tone?: "danger" }) {
  const styles = useStyles();
  return <Text style={[styles.note, tone === "danger" ? { color: colors.danger } : null]}>{children}</Text>;
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={{ gap: 10 }}>
      <Note tone="danger">{message}</Note>
      <Button label="Retry" tone="quiet" onPress={onRetry} />
    </View>
  );
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
  const reduceMotion = useReduceMotion();
  const opacity = useSharedValue(reduceMotion ? 1 : 0.35);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1;
      return;
    }
    opacity.value = withTiming(0.85, { duration: 750 }, () => {
      const pulse = () => {
        opacity.value = withTiming(0.35, { duration: 750 }, () => {
          opacity.value = withTiming(0.85, { duration: 750 }, pulse);
        });
      };
      pulse();
    });
  }, [opacity, reduceMotion]);

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

      {/* One destination row, matching Your money */}
      <View style={styles.card}>
        <View style={[styles.ledger, { alignItems: "center", gap: 12 }]}>
          <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.fillStrong }} />
          <View style={{ flex: 1, height: 14, borderRadius: 5, backgroundColor: colors.fillStrong }} />
          <View style={{ width: 8, height: 12, borderRadius: 2, backgroundColor: colors.fill }} />
        </View>
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

function moneyValue(value: string) {
  const n = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function moneySlots(from: string, to: string) {
  const anchorOf = (value: string) => {
    const dot = value.indexOf(".");
    return dot === -1 ? value.length : dot;
  };
  const fromAnchor = anchorOf(from);
  const toAnchor = anchorOf(to);
  const offsets = new Set<number>();
  [...from].forEach((_, index) => offsets.add(fromAnchor - index));
  [...to].forEach((_, index) => offsets.add(toAnchor - index));
  return [...offsets]
    .sort((a, b) => b - a)
    .map((offset) => ({
      offset,
      from: from[fromAnchor - offset] ?? "",
      to: to[toAnchor - offset] ?? "",
    }));
}

/** Digits travel when the formatted amount changes. The first paint holds still. */
export function RollingFigure({
  text,
  live = false,
  style,
  duration = 320,
}: {
  text: string;
  live?: boolean;
  style?: StyleProp<TextStyle>;
  duration?: number;
}) {
  const reduceMotion = useReduceMotion();
  const shown = useRef(text);
  const progress = useRef(new Animated.Value(1)).current;
  const run = useRef(0);
  const [tick, setTick] = useState<{ from: string; to: string; rising: boolean } | null>(null);

  useEffect(() => {
    if (text === shown.current) return;
    const previous = shown.current;
    shown.current = text;
    if (live || reduceMotion) {
      setTick(null);
      progress.setValue(1);
      return;
    }
    const id = ++run.current;
    setTick({ from: previous, to: text, rising: moneyValue(text) >= moneyValue(previous) });
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && run.current === id) setTick(null);
    });
  }, [text, live, reduceMotion, duration, progress]);

  if (!tick) return <Text style={style}>{text}</Text>;

  const fontSize = (StyleSheet.flatten(style)?.fontSize as number | undefined) ?? 16;
  const travel = fontSize * 0.62;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
      {moneySlots(tick.from, tick.to).map((slot) => {
        if (!slot.from || !slot.to || slot.from === slot.to) {
          return (
            <Text key={slot.offset} style={style}>
              {slot.to || slot.from}
            </Text>
          );
        }
        const outY = progress.interpolate({ inputRange: [0, 1], outputRange: [0, tick.rising ? -travel : travel] });
        const inY = progress.interpolate({ inputRange: [0, 1], outputRange: [tick.rising ? travel : -travel, 0] });
        const outOpacity = progress.interpolate({ inputRange: [0, 0.55], outputRange: [1, 0], extrapolate: "clamp" });
        const inOpacity = progress.interpolate({ inputRange: [0.25, 1], outputRange: [0, 1], extrapolate: "clamp" });
        return (
          <View key={slot.offset} style={{ height: fontSize * 1.15, justifyContent: "center", overflow: "hidden" }}>
            <Text style={[style, { opacity: 0 }]}>{slot.to}</Text>
            <Animated.View style={{ position: "absolute", left: 0, right: 0, opacity: outOpacity, transform: [{ translateY: outY }] }}>
              <Text style={[style, { textAlign: "center" }]}>{slot.from}</Text>
            </Animated.View>
            <Animated.View style={{ position: "absolute", left: 0, right: 0, opacity: inOpacity, transform: [{ translateY: inY }] }}>
              <Text style={[style, { textAlign: "center" }]}>{slot.to}</Text>
            </Animated.View>
          </View>
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
  figureAnchor,
  chartHandoff = false,
  figureSeed = null,
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
  figureAnchor?: string;
  chartHandoff?: boolean;
  figureSeed?: string | null;
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
  const figureStyle = [
    styles.heroFigure,
    empty ? styles.heroEmpty : null,
    tone === "bad" ? { color: colors.danger } : null,
    tone === "good" ? { color: colors.positive } : null,
  ];
  const figureMeasure = useMeasuredAnchor(figureAnchor, {
    text: figureText,
    color: tone === "bad" ? colors.danger : tone === "good" ? colors.positive : colors.ink,
    fontSize: 46,
  });
  const figureOpacity = useFlightHidden(figureAnchor);
  const figure = empty ? (
    <Text style={figureStyle}>{figureSeed ?? figureText}</Text>
  ) : (
    <RollingFigure text={figureSeed ?? figureText} live={live} style={figureStyle} />
  );
  const figureBody = (
    <View ref={figureMeasure.ref} onLayout={figureMeasure.onLayout} collapsable={false} style={{ alignSelf: "flex-start", opacity: figureOpacity }}>
      {figure}
    </View>
  );

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
          {figureBody}
        </Pressable>
      ) : (
        figureBody
      )}
      {subtitle ? <View style={{ marginTop: 4 }}>{subtitle}</View> : null}
      {charting && points ? (
        <Animated.View style={{ opacity: chartHandoff ? chartOpacity : 1 }}>
          <SpendChart points={points} onScrub={onScrub} reference={reference} caption={caption} color={color} />
        </Animated.View>
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

export function Facts({ items }: { items: { kicker: string; value: string; color?: string; onPress?: () => void; anchor?: string }[] }) {
  const styles = useStyles();
  return (
    <View style={styles.facts}>
      {items.map((item) => (
        <FactItem key={item.kicker} item={item} />
      ))}
    </View>
  );
}

function FactItem({ item }: { item: { kicker: string; value: string; color?: string; onPress?: () => void; anchor?: string } }) {
  const styles = useStyles();
  const measure = useMeasuredAnchor(item.anchor, { text: item.value, color: item.color ?? colors.ink, fontSize: 15 });
  const opacity = useFlightHidden(item.anchor);
  const body = (
    <View style={{ gap: 2, alignSelf: "stretch", opacity }}>
      <Text style={styles.kicker} numberOfLines={1}>
        {item.kicker}
      </Text>
      <View ref={measure.ref} onLayout={measure.onLayout} collapsable={false}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.55}
          style={[styles.factValue, item.color ? { color: item.color } : null]}
        >
          {item.value}
        </Text>
      </View>
    </View>
  );
  if (!item.onPress) return <View style={{ flex: 1, minWidth: 0 }}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.kicker} ${item.value}`}
      onPress={item.onPress}
      style={{ flex: 1, minWidth: 0 }}
    >
      {body}
    </Pressable>
  );
}

export function SpendMix({
  rows,
  onSlice,
  anchorFor,
}: {
  rows: { key: string; cents: number; color: string }[];
  onSlice?: (key: string) => void;
  anchorFor?: (key: string) => string;
}) {
  const styles = useStyles();
  const reduceMotion = useReduceMotion();
  const shown = rows.filter((row) => row.cents > 0);
  const signature = shown.map((row) => `${row.key}:${row.cents}`).join(",");
  const widths = useRef(new Map<string, Animated.Value>());
  const seen = useRef(new Map<string, number>());

  function widthFor(key: string) {
    const existing = widths.current.get(key);
    if (existing) return existing;
    const created = new Animated.Value(0.01);
    widths.current.set(key, created);
    return created;
  }

  useEffect(() => {
    for (const row of shown) {
      const value = widthFor(row.key);
      const previous = seen.current.get(row.key);
      const next = row.cents;
      if (reduceMotion || previous == null) {
        if (reduceMotion) value.setValue(next);
        else Animated.timing(value, { toValue: next, duration: previous == null ? 560 : 420, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
      } else if (previous !== next) {
        Animated.timing(value, { toValue: next, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
      }
      seen.current.set(row.key, next);
    }
  }, [signature, reduceMotion]);

  if (shown.length < 2) return null;
  return (
    <View style={styles.mix}>
      {shown.map((row) => (
        <MixSlice key={row.key} row={row} width={widthFor(row.key)} onSlice={onSlice} anchor={anchorFor?.(row.key) ?? null} />
      ))}
    </View>
  );
}

function MixSlice({
  row,
  width,
  onSlice,
  anchor,
}: {
  row: { key: string; cents: number; color: string };
  width: Animated.Value;
  onSlice?: (key: string) => void;
  anchor: string | null;
}) {
  const measure = useMeasuredAnchor(anchor);
  const body = (
    <Animated.View
      ref={measure.ref}
      onLayout={measure.onLayout}
      collapsable={false}
      style={{ flexGrow: width, flexBasis: 4, backgroundColor: row.color }}
    >
      {onSlice ? (
        <Pressable onPress={() => onSlice(row.key)} style={{ flex: 1 }} hitSlop={{ top: 12, bottom: 12 }} />
      ) : null}
    </Animated.View>
  );
  return body;
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
  const title = label || (count ? `${count} ${count === 1 ? "purchase" : "purchases"} to review` : "Review purchases");

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        tapPress();
        onPress();
      }}
      style={({ pressed }) => [styles.banner, pressed ? { opacity: 0.88, transform: [{ scale: 0.985 }] } : null]}
    >
      <View style={styles.bannerIconWrap}>
        <Icon name="tag" size={17} color={colors.accentInk} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={styles.bannerTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.bannerSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Text style={{ fontSize: 13, fontWeight: "600", color: palette.accentInk }}>Review</Text>
        <Icon name="chevron" size={13} color={palette.accentInk} />
      </View>
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

export function SheetContainer({
  visible = true,
  onClose,
  title,
  subtitle,
  subtitleColor,
  rightAction,
  children,
  minHeight = 320,
  height = "80%",
  scrollable = true,
  origin = null,
  originAnchor,
  carry = null,
  titleAnchor,
  overlay = null,
  onOverlayDone,
  fit = false,
}: {
  visible?: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  subtitleColor?: string;
  rightAction?: ReactNode;
  children: ReactNode;
  minHeight?: number | `${number}%`;
  height?: number | `${number}%`;
  scrollable?: boolean;
  origin?: FlightRect | null;
  originAnchor?: string;
  carry?: FlightPiece[] | null;
  titleAnchor?: string;
  overlay?: FlightPiece[] | null;
  onOverlayDone?: () => void;
  /** Hug the rows instead of a tall empty panel. */
  fit?: boolean;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const reduceTransparency = useReduceTransparency();
  const reduceMotion = useReduceMotion();
  const isDark = palette.scheme === "dark";
  const screenHeight = Dimensions.get("window").height;
  const translateY = useRef(new Animated.Value(screenHeight)).current;
  const grow = useRef(new Animated.Value(1)).current;
  const sheetRef = useRef<View>(null);
  const originRef = useRef(origin);
  originRef.current = origin;
  const originAnchorRef = useRef(originAnchor);
  originAnchorRef.current = originAnchor;
  const [metrics, setMetrics] = useState<{ from: FlightRect; box: FlightRect } | null>(null);
  const titleMeasure = useMeasuredAnchor(titleAnchor, title ? { text: title, color: palette.ink, fontSize: 20 } : null);
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
    if (visible) {
      isClosing.current = false;
      hasClosedRef.current = false;
      setClosing(false);
      if (reduceMotion) {
        translateY.setValue(0);
        grow.setValue(1);
        return;
      }
      if (origin) {
        translateY.setValue(0);
        grow.setValue(0);
        setMetrics(null);
        return;
      }
      translateY.setValue(screenHeight);
      grow.setValue(1);
      Animated.spring(translateY, {
        toValue: 0,
        damping: 28,
        stiffness: 340,
        mass: 0.8,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, screenHeight, translateY, reduceMotion, origin, grow]);

  const dismiss = useCallback((velocity = 0) => {
    if (isClosing.current) return;
    isClosing.current = true;
    setClosing(true);
    Keyboard.dismiss();
    tapPress();

    if (reduceMotion) {
      translateY.setValue(screenHeight);
      handleClose();
      return;
    }

    const foldFrom = (originAnchorRef.current && anchorRect(originAnchorRef.current)) || originRef.current;
    if (foldFrom && metrics) {
      setMetrics({ ...metrics, from: foldFrom });
      const fallbackTimer = setTimeout(handleClose, 700);
      requestAnimationFrame(() => {
        Animated.timing(grow, { toValue: 0, duration: 340, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
          clearTimeout(fallbackTimer);
          handleClose();
        });
      });
      return;
    }

    const fallbackTimer = setTimeout(handleClose, 700);
    Animated.spring(translateY, {
      toValue: screenHeight,
      velocity,
      damping: 32,
      stiffness: 280,
      mass: 0.8,
      overshootClamping: true,
      useNativeDriver: true,
    }).start(() => {
      clearTimeout(fallbackTimer);
      handleClose();
    });
  }, [handleClose, reduceMotion, screenHeight, translateY, grow, metrics]);

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
          if (gestureState.dy < 0) {
            translateY.setValue(-Math.min(42, Math.pow(Math.abs(gestureState.dy), 0.72)));
          } else {
            translateY.setValue(gestureState.dy);
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          if (isClosing.current) return;
          const perSecond = Math.abs(gestureState.vy) > 40 ? gestureState.vy : gestureState.vy * 1000;
          translateY.stopAnimation((current) => {
            if (current > 72 || perSecond > 900) dismiss(Math.max(perSecond, 0));
            else {
              Animated.spring(translateY, {
                toValue: 0,
                velocity: perSecond,
                damping: 26,
                stiffness: 380,
                useNativeDriver: true,
              }).start();
            }
          });
        },
      }),
    [dismiss, translateY],
  );

  if (!visible) return null;

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
      onRequestClose={() => dismiss()}
    >
      <View style={styles.sheetWrap} pointerEvents={closing ? "none" : "auto"}>
        <Animated.View style={[styles.sheetBackdrop, { opacity: backdropOpacity }]}>
          {!reduceTransparency ? (
            <BlurView
              intensity={isDark ? 30 : 20}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          <Pressable style={StyleSheet.absoluteFill} onPress={() => dismiss()} />
        </Animated.View>
        <Animated.View
          ref={sheetRef}
          onLayout={() => {
            if (!originRef.current) return;
            requestAnimationFrame(() => {
              sheetRef.current?.measureInWindow((x, y, width, height) => {
                if (!originRef.current || width <= 0 || height <= 0) return;
                setMetrics({ from: originRef.current, box: { x, y, width, height } });
                Animated.spring(grow, {
                  toValue: 1,
                  damping: 28,
                  stiffness: 340,
                  mass: 0.8,
                  useNativeDriver: true,
                }).start();
              });
            });
          }}
          style={[
            styles.sheet,
            fit ? null : minHeight ? { minHeight } : null,
            fit ? null : height ? { height } : null,
            origin && !metrics && !reduceMotion ? { opacity: 0 } : null,
            {
              transform: metrics
                ? [
                    {
                      translateX: grow.interpolate({
                        inputRange: [0, 1],
                        outputRange: [
                          metrics.from.x + metrics.from.width / 2 - (metrics.box.x + metrics.box.width / 2),
                          0,
                        ],
                      }),
                    },
                    {
                      translateY: Animated.add(
                        translateY,
                        grow.interpolate({
                          inputRange: [0, 1],
                          outputRange: [
                            metrics.from.y + metrics.from.height / 2 - (metrics.box.y + metrics.box.height / 2),
                            0,
                          ],
                        }),
                      ),
                    },
                    {
                      scaleX: grow.interpolate({
                        inputRange: [0, 1],
                        outputRange: [Math.max(0.08, metrics.from.width / Math.max(metrics.box.width, 1)), 1],
                      }),
                    },
                    {
                      scaleY: grow.interpolate({
                        inputRange: [0, 1],
                        outputRange: [Math.max(0.08, metrics.from.height / Math.max(metrics.box.height, 1)), 1],
                      }),
                    },
                  ]
                : [{ translateY }],
            },
          ]}
        >
          {!reduceTransparency ? (
            <BlurView
              intensity={isDark ? 75 : 85}
              tint={palette.blurTint}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          <Animated.View
            style={{
              flex: 1,
              opacity:
                origin && !reduceMotion
                  ? grow.interpolate({ inputRange: [0, 0.62, 1], outputRange: [0, 0, 1] })
                  : 1,
            }}
          >
          <View style={{ paddingTop: 8, paddingBottom: 6 }}>
            <View
              {...panResponder.panHandlers}
              style={{ paddingVertical: 10, paddingHorizontal: 40, alignSelf: "center" }}
            >
              <View style={styles.handle} />
            </View>
            {title ? (
              <View style={styles.sheetHead}>
                <View ref={titleMeasure.ref} onLayout={titleMeasure.onLayout} collapsable={false} style={{ flex: 1, gap: 2, marginRight: 12 }}>
                  <Text style={styles.sheetTitle} numberOfLines={1}>
                    {title}
                  </Text>
                  {subtitle ? (
                    <Text style={[styles.sheetSubtitle, subtitleColor ? { color: subtitleColor } : null]} numberOfLines={1}>
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
                {rightAction ? (
                  rightAction
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => dismiss()}
                    hitSlop={16}
                    style={({ pressed }) => [
                      styles.sheetDoneBtn,
                      pressed ? { opacity: 0.6 } : null,
                    ]}
                  >
                    <Text style={styles.sheetDoneText}>Done</Text>
                  </Pressable>
                )}
              </View>
            ) : null}
          </View>
          {fit ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 12) }}>
              <SmallSections value="small">{children}</SmallSections>
            </View>
          ) : scrollable ? (
            <ScrollView
              style={{ flex: 1 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom + 24, 40), gap: 14 }}
            >
              <SmallSections value="small">{children}</SmallSections>
            </ScrollView>
          ) : (
            <View style={{ flex: 1, paddingBottom: Math.max(insets.bottom + 16, 24) }}>
              <SmallSections value="small">{children}</SmallSections>
            </View>
          )}
          </Animated.View>
        </Animated.View>
        {carry && carry.length && !reduceMotion ? (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <FlightRun plan={{ id: `sheet-carry-${title ?? "sheet"}`, pieces: carry }} onDone={() => undefined} />
          </View>
        ) : null}
        {overlay && overlay.length && !reduceMotion ? (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <FlightRun plan={{ id: `sheet-overlay-${overlay.map((piece) => piece.key).join("-")}`, pieces: overlay }} onDone={() => onOverlayDone?.()} />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

export function Sheet({
  title,
  subtitle,
  subtitleColor,
  onClose,
  children,
  height = "80%",
  minHeight = 320,
  origin = null,
  originAnchor,
  carry = null,
  titleAnchor,
  overlay = null,
  onOverlayDone,
  fit = false,
}: {
  title: string;
  subtitle?: string;
  subtitleColor?: string;
  onClose: () => void;
  children: ReactNode;
  height?: number | `${number}%`;
  minHeight?: number | `${number}%`;
  origin?: FlightRect | null;
  originAnchor?: string;
  carry?: FlightPiece[] | null;
  titleAnchor?: string;
  overlay?: FlightPiece[] | null;
  onOverlayDone?: () => void;
  /** Hug the rows instead of a tall empty panel. */
  fit?: boolean;
}) {
  return (
    <SheetContainer
      visible
      title={title}
      subtitle={subtitle}
      subtitleColor={subtitleColor}
      onClose={onClose}
      height={height}
      minHeight={minHeight}
      origin={origin}
      originAnchor={originAnchor}
      carry={carry}
      titleAnchor={titleAnchor}
      overlay={overlay}
      onOverlayDone={onOverlayDone}
      fit={fit}
    >
      {children}
    </SheetContainer>
  );
}

function NumberKey({
  label,
  icon,
  onPress,
  isSpecial,
}: {
  label?: string;
  icon?: string;
  onPress: () => void;
  isSpecial?: boolean;
}) {
  const { palette } = useTheme();
  const isDark = palette.scheme === "dark";
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label || (icon === "back" ? "Backspace" : "Key")}
      onPressIn={() => {
        tapSelect();
        Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, stiffness: 600, damping: 25 }).start();
      }}
      onPressOut={() => {
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, stiffness: 600, damping: 25 }).start();
      }}
      onPress={onPress}
      style={{ flex: 1, height: 48 }}
    >
      <Animated.View
        style={[
          {
            flex: 1,
            borderRadius: 14,
            borderCurve: "continuous",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: isDark
              ? isSpecial
                ? "rgba(255, 255, 255, 0.07)"
                : "rgba(255, 255, 255, 0.12)"
              : isSpecial
                ? "rgba(0, 0, 0, 0.04)"
                : "rgba(255, 255, 255, 0.95)",
            borderWidth: 1,
            borderColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1.5 },
            shadowOpacity: isDark ? 0.22 : 0.04,
            shadowRadius: 3,
            elevation: 1,
            transform: [{ scale }],
          },
        ]}
      >
        {icon === "back" ? (
          <Icon name="chevron-left" size={18} color={palette.ink} />
        ) : (
          <Text
            style={{
              fontSize: isSpecial ? 15 : 22,
              fontWeight: isSpecial ? "600" : "500",
              color: isSpecial ? palette.muted : palette.ink,
              fontVariant: ["tabular-nums"],
            }}
          >
            {label}
          </Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

export function NumberPad({
  onKey,
  onClear,
  onBackspace,
  onDecimal,
  hasDecimal = false,
  style,
}: {
  onKey: (digit: string) => void;
  onClear?: () => void;
  onBackspace: () => void;
  onDecimal?: () => void;
  hasDecimal?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ gap: 8 }, style]}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <NumberKey label="1" onPress={() => onKey("1")} />
        <NumberKey label="2" onPress={() => onKey("2")} />
        <NumberKey label="3" onPress={() => onKey("3")} />
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <NumberKey label="4" onPress={() => onKey("4")} />
        <NumberKey label="5" onPress={() => onKey("5")} />
        <NumberKey label="6" onPress={() => onKey("6")} />
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <NumberKey label="7" onPress={() => onKey("7")} />
        <NumberKey label="8" onPress={() => onKey("8")} />
        <NumberKey label="9" onPress={() => onKey("9")} />
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {hasDecimal ? (
          <NumberKey label="." onPress={() => (onDecimal ? onDecimal() : onKey("."))} isSpecial />
        ) : (
          <NumberKey label="C" onPress={() => onClear?.()} isSpecial />
        )}
        <NumberKey label="0" onPress={() => onKey("0")} />
        <NumberKey icon="back" onPress={onBackspace} isSpecial />
      </View>
    </View>
  );
}

export function EnvelopesGlance({
  onSelectCategory,
  onViewAll,
}: {
  onSelectCategory?: (categoryId: string) => void;
  onViewAll?: () => void;
}) {
  const { palette } = useTheme();
  const now = new Date();
  const budgetPath = `/api/budget?year=${now.getFullYear()}&month=${now.getMonth() + 1}`;
  const [data, setData] = useState<{ rows: { plannedCents: number; spentCents: number; availableCents?: number; remainingCents: number; category: { id: string; name: string; color?: string | null }; group?: { color?: string | null } | null }[] } | null>(() => peek<any>(budgetPath) ?? null);

  useEffect(() => {
    if (!data) {
      load<any>(budgetPath)
        .then((res) => setData(res))
        .catch(() => undefined);
    }
  }, [budgetPath, data]);

  const activeEnvelopes = useMemo(() => {
    if (!data?.rows) return [];
    return data.rows
      .filter((r) => r.plannedCents > 0)
      .slice(0, 6)
      .map((r) => {
        const spent = r.spentCents;
        const planned = r.availableCents || r.plannedCents;
        const progress = planned > 0 ? spent / planned : 0;
        const color = shelfColor(r.group?.color || r.category?.color || "#1B7A62");
        const remaining = planned - spent;
        return {
          id: r.category.id,
          name: r.category.name,
          color,
          spent,
          planned,
          progress,
          remaining,
        };
      });
  }, [data]);

  if (activeEnvelopes.length === 0) return null;

  return (
    <View style={{ gap: 8 }}>
      <Section
        title="Category Envelopes"
        action="View plan"
        onAction={onViewAll}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingVertical: 2 }}
      >
        {activeEnvelopes.map((env) => {
          const isOver = env.remaining < 0;
          return (
            <Pressable
              key={env.id}
              accessibilityRole="button"
              accessibilityLabel={`${env.name}, ${money(Math.abs(env.remaining))} ${isOver ? "over" : "left"}`}
              onPress={() => {
                tapPress();
                onSelectCategory?.(env.id);
              }}
              style={({ pressed }) => [
                {
                  backgroundColor: palette.card,
                  borderRadius: 20,
                  borderCurve: "continuous",
                  borderWidth: 1,
                  borderColor: palette.line,
                  padding: 14,
                  width: 145,
                  gap: 10,
                  shadowColor: "#000",
                  shadowOpacity: palette.scheme === "dark" ? 0.2 : 0.03,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 3 },
                  elevation: 2,
                },
                pressed ? { opacity: 0.85, transform: [{ scale: 0.97 }] } : null,
              ]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <ProgressRing
                  size={36}
                  strokeWidth={3.5}
                  progress={env.progress}
                  color={isOver ? palette.danger : env.color}
                >
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: env.color }} />
                </ProgressRing>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "600",
                    color: isOver ? palette.danger : palette.muted,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {Math.round(env.progress * 100)}%
                </Text>
              </View>
              <View style={{ gap: 2 }}>
                <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", color: palette.ink }}>
                  {env.name}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 12,
                    fontWeight: "500",
                    color: isOver ? palette.danger : palette.muted,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {isOver ? `-${money(Math.abs(env.remaining))}` : `${money(env.remaining)} left`}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function SpendCard({
  monthName,
  spentCents,
  budgetCents,
  onPress,
}: {
  monthName?: string;
  spentCents: number;
  budgetCents: number;
  onPress?: () => void;
}) {
  const styles = useStyles();
  const { palette } = useTheme();
  const leftCents = budgetCents - spentCents;
  const over = budgetCents > 0 && leftCents < 0;
  const leftLabel = over
    ? `${money(Math.abs(leftCents))} over budget`
    : `${money(Math.max(0, leftCents))} left of ${money(budgetCents)}`;

  const body = (
    <View style={styles.pacingCard}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={styles.pacingEyebrow}>Spent</Text>
        {monthName ? <Text style={styles.pacingEyebrow}>{monthName}</Text> : null}
      </View>

      <Text style={styles.pacingFigure}>{money(spentCents)}</Text>

      <View style={{ gap: 8 }}>
        <Progress value={spentCents} max={budgetCents} color={over ? palette.danger : palette.accent} />
        <Text style={[styles.pacingCaption, over ? { color: palette.danger } : null]}>{leftLabel}</Text>
      </View>
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Spent ${money(spentCents)}. ${leftLabel}. Tap to view the plan.`}
      style={({ pressed }) => (pressed ? { opacity: 0.9, transform: [{ scale: 0.985 }] } : null)}
    >
      {body}
    </Pressable>
  );
}

function FlowToggle({ isIncome, onChange }: { isIncome: boolean; onChange: (income: boolean) => void }) {
  const { palette } = useTheme();
  const reduceMotion = useReduceMotion();
  const isDark = palette.scheme === "dark";
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const inner = Math.max(0, width - 6);
  const item = inner / 2;
  useEffect(() => {
    const to = isIncome ? item : 0;
    if (reduceMotion || item <= 0) {
      x.setValue(to);
      return;
    }
    Animated.spring(x, { toValue: to, useNativeDriver: true, stiffness: 460, damping: 34, mass: 0.7 }).start();
  }, [isIncome, item, reduceMotion, x]);
  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{
        position: "relative",
        minHeight: 42,
        padding: 3,
        borderRadius: 999,
        borderCurve: "continuous",
        backgroundColor: isDark ? "rgba(38, 43, 52, 0.7)" : "rgba(224, 229, 235, 0.75)",
        flexDirection: "row",
      }}
    >
      {item > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 3,
            bottom: 3,
            left: 3,
            width: item,
            borderRadius: 999,
            backgroundColor: isIncome ? palette.positive : palette.control,
            transform: [{ translateX: x }],
          }}
        />
      ) : null}
      {(["Expense", "Income"] as const).map((label) => {
        const selected = label === "Income" ? isIncome : !isIncome;
        const ink = !selected ? palette.muted : label === "Income" ? "#ffffff" : palette.controlInk;
        return (
          <Pressable
            key={label}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={{ flex: 1, minHeight: 36, alignItems: "center", justifyContent: "center" }}
            onPress={() => {
              if ((label === "Income") === isIncome) return;
              tapSelect();
              onChange(label === "Income");
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: ink }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const QUICK_ACCOUNT_KEY = "shelf.quickadd.account";

function amountToCents(raw: string): number {
  if (!raw || raw === ".") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

function pushDigit(raw: string, digit: string): string {
  const [whole, frac] = raw.split(".");
  if (raw.includes(".")) {
    if ((frac ?? "").length >= 2) return raw;
    return `${whole}.${frac ?? ""}${digit}`;
  }
  if (whole === "0") return digit;
  if ((whole ?? "").length >= 7) return raw;
  return `${raw}${digit}`;
}

function pickQuickCategory(
  list: { id: string; name: string; color: string; kind: string }[],
  income: boolean,
) {
  const pool = list.filter((c) => (income ? c.kind === "income" : c.kind !== "income"));
  if (!income) return pool.find((c) => c.id === "cat-uncategorized") ?? pool[0] ?? null;
  return pool[0] ?? null;
}

export type QuickLogDraft = {
  amount: string;
  merchant: string;
  isIncome: boolean;
  accountId: string;
  categoryId: string | null;
};

export function QuickLogModal({
  visible,
  onClose,
  onSuccess,
  onFail,
  draft,
  initialError,
}: {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void | Promise<void>;
  onFail?: (draft: QuickLogDraft, message: string) => void;
  draft?: QuickLogDraft | null;
  initialError?: string | null;
}) {
  const { palette } = useTheme();
  const isDark = palette.scheme === "dark";
  const reduceMotion = useReduceMotion();
  const padAmount = useMeasuredAnchor("pad.amount");
  const padMerchant = useMeasuredAnchor("pad.merchant");
  const padColor = useMeasuredAnchor("pad.color");

  const [amount, setAmount] = useState("");
  const [pickingAccount, setPickingAccount] = useState(false);
  const [isIncome, setIsIncome] = useState(false);
  const [merchant, setMerchant] = useState("");
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string; color: string; kind: string }[]>([]);
  const incomeMode = useRef(false);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [accountId, setAccountId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rules, setRules] = useState<{ matchMerchant: string | null; actionCategoryId: string | null }[]>([]);

  useEffect(() => {
    if (!visible) return;
    const opening = draft ?? null;
    setAmount(opening?.amount ?? "");
    setPickingAccount(false);
    setIsIncome(opening?.isIncome ?? false);
    incomeMode.current = opening?.isIncome ?? false;
    setMerchant(opening?.merchant ?? "");
    setError(initialError ?? null);
    setBusy(false);
    if (opening?.categoryId) setSelectedCatId(opening.categoryId);
    if (opening?.accountId) setAccountId(opening.accountId);

    const applyCats = (flat: { id: string; name: string; color: string; kind: string }[]) => {
      setCategories(flat);
      if (opening?.categoryId && flat.some((item) => item.id === opening.categoryId)) setSelectedCatId(opening.categoryId);
      else if (!opening) setSelectedCatId(pickQuickCategory(flat, incomeMode.current)?.id ?? null);
    };
    const cachedCats = peek<{ groups: { name: string; categories: { id: string; name: string; color?: string | null; kind?: string }[] }[] }>("/api/categories");
    if (cachedCats?.groups) {
      applyCats(cachedCats.groups.flatMap((g) => g.categories).map((c) => ({ id: c.id, name: c.name, color: shelfColor(c.color), kind: c.kind ?? "expense" })));
    } else {
      void api<{ groups: { name: string; categories: { id: string; name: string; color?: string | null; kind?: string }[] }[] }>("/api/categories")
        .then((res) => {
          applyCats(res.groups.flatMap((g) => g.categories).map((c) => ({ id: c.id, name: c.name, color: shelfColor(c.color), kind: c.kind ?? "expense" })));
        })
        .catch(() => undefined);
    }

    let cancelled = false;
    void (async () => {
      const cachedAccts = peek<{ accounts: { id: string; name: string; isHidden?: boolean }[] }>("/api/accounts");
      let list = cachedAccts?.accounts ?? [];
      if (!list.length) {
        try {
          const res = await api<{ accounts: { id: string; name: string; isHidden?: boolean }[] }>("/api/accounts");
          list = res.accounts;
        } catch {
          list = [];
        }
      }
      list = list.filter((account) => !account.isHidden);
      if (cancelled) return;
      setAccounts(list);
      const saved = await SecureStore.getItemAsync(QUICK_ACCOUNT_KEY).catch(() => null);
      const match = list.find((account) => account.id === saved);
      const preferred = opening?.accountId && list.some((account) => account.id === opening.accountId) ? opening.accountId : null;
      setAccountId(preferred ?? match?.id ?? list[0]?.id ?? "");
    })();
    const cachedRules = peek<{ rules: { matchMerchant: string | null; actionCategoryId: string | null }[] }>("/api/rules");
    if (cachedRules?.rules) setRules(cachedRules.rules);
    void api<{ rules: { matchMerchant: string | null; actionCategoryId: string | null }[] }>("/api/rules")
      .then((res) => {
        if (!cancelled) setRules(res.rules);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [visible, draft, initialError]);

  async function handleSave() {
    const cents = amountToCents(amount);
    if (cents <= 0 || !accountId) return;
    const pool = categories.filter((c) => (isIncome ? c.kind === "income" : c.kind !== "income"));
    const chosenCat = pool.find((c) => c.id === selectedCatId) ?? pickQuickCategory(categories, isIncome);
    const label = merchant.trim() || chosenCat?.name || (isIncome ? "Income" : "Expense");
    const savedDraft: QuickLogDraft = { amount, merchant, isIncome, accountId, categoryId: chosenCat?.id ?? null };
    const log: QuickLog = {
      tempId: `tmp-${Date.now()}`,
      name: label,
      amountCents: isIncome ? -cents : cents,
      date: todayISO(),
      categoryId: chosenCat?.id ?? null,
      categoryName: chosenCat?.name ?? null,
      categoryColor: chosenCat?.color ?? null,
      accountId,
      accountName: accounts.find((account) => account.id === accountId)?.name ?? "",
      amount,
      merchant: label,
      isIncome,
    };
    stageQuickLog(log);
    const where = flightSurface();
    const rowAnchor = where === "activity" ? `activity.tx.${log.tempId}` : `today.tx.${log.tempId}`;
    const leftAnchor = where === "plan" ? "plan.left" : "today.left";
    const shownAmount = `${isIncome ? "+" : ""}${money(cents)}`;
    const amountFrom = anchorRect("pad.amount");
    const merchantFrom = anchorRect("pad.merchant");
    const colorFrom = anchorRect("pad.color");
    const padPieces: FlightPiece[] = [];
    if (amountFrom) {
      padPieces.push({
        key: "amount",
        text: shownAmount,
        color: isIncome ? palette.positive : chosenCat?.color || palette.ink,
        fontSize: 48,
        fontWeight: "700",
        from: amountFrom,
        toAnchor: rowAnchor,
        toFontSize: 16,
        toColor: isIncome ? palette.positive : palette.ink,
      });
      padPieces.push({
        key: "cents",
        text: shownAmount,
        color: isIncome ? palette.positive : palette.ink,
        fontSize: 48,
        fontWeight: "700",
        from: amountFrom,
        toAnchor: leftAnchor,
        toFontSize: where === "plan" ? 38 : 46,
        delay: 50,
      });
    }
    if (merchantFrom) {
      padPieces.push({
        key: "merchant",
        text: label,
        color: palette.ink,
        fontSize: 15,
        fontWeight: "500",
        from: merchantFrom,
        toAnchor: rowAnchor,
        toFontSize: 16,
        delay: 30,
      });
    }
    if (colorFrom && chosenCat) {
      padPieces.push({
        key: "color",
        kind: "fill",
        color: chosenCat.color,
        fontSize: 8,
        from: colorFrom,
        toAnchor: where === "plan" ? `plan.bar.${chosenCat.id}` : `today.slice.${chosenCat.id}`,
      });
    }
    if (padPieces.length) playFlight({ id: "pad", hide: [rowAnchor], pieces: padPieces }, reduceMotion);
    celebrate(isIncome ? "Income logged" : "Expense logged");
    onClose();
    try {
      await api("/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          name: label,
          amount: (cents / 100) * (isIncome ? -1 : 1),
          date: log.date,
          categoryId: chosenCat?.id,
          accountId,
        }),
      });
      await SecureStore.setItemAsync(QUICK_ACCOUNT_KEY, accountId).catch(() => undefined);
      await onSuccess?.();
      settleQuickLog(log);
    } catch (err) {
      dropQuickLog(log.tempId);
      onFail?.(savedDraft, err instanceof Error ? err.message : "Failed to log charge");
    }
  }

  if (!visible) return null;

  const cents = amountToCents(amount);
  const accountName = accounts.find((account) => account.id === accountId)?.name ?? "";
  const categoryPool = categories.filter((c) => (isIncome ? c.kind === "income" : c.kind !== "income"));
  const preferred = pickQuickCategory(categories, isIncome);
  const head = categoryPool.slice(0, 8);
  const quickPillCats = preferred && !head.some((c) => c.id === preferred.id) ? [preferred, ...head].slice(0, 8) : head;
  const saveLabel = !accountName ? "Choose an account" : cents > 0 ? `Add to ${accountName}` : "Enter an amount";
  const now = new Date();
  const rawDash = peek<{
    transactions: {
      id: string;
      name: string;
      amountCents: number;
      date: string;
      merchantName: string | null;
      categoryId?: string | null;
      category?: { id?: string } | null;
    }[];
    budget: { plannedCents: number; spentCents: number; remainingCents: number };
    cashFlow: { incomeCents: number; spendingCents: number; savedCents: number };
    unreviewed: { count: number };
  }>(dashboardPath());
  const dash = rawDash ? mergeDashboard(rawDash) : null;
  const rawBudget = peek<{
    expenseSpentCents: number;
    rows: { category: { id: string; name: string }; availableCents: number; remainingCents: number; spentCents: number }[];
  }>(`/api/budget?year=${now.getFullYear()}&month=${now.getMonth() + 1}`);
  const budget = rawBudget ? mergeBudget(rawBudget) : null;
  const plannedCents = dash?.budget.plannedCents ?? 0;
  const leftCents = plannedCents - (dash?.budget.spentCents ?? 0);
  const nextLeft = isIncome ? leftCents + cents : leftCents - cents;
  const planRow = budget?.rows.find((row) => row.category.id === selectedCatId && row.availableCents > 0);
  const nextCategory = planRow ? (isIncome ? planRow.remainingCents + cents : planRow.remainingCents - cents) : null;
  const seenMerchants = new Set<string>();
  const merchantChips: { name: string; categoryId: string | null }[] = [];
  for (const tx of dash?.transactions ?? []) {
    const name = tx.merchantName?.trim();
    if (!name || seenMerchants.has(name)) continue;
    seenMerchants.add(name);
    merchantChips.push({ name, categoryId: tx.categoryId ?? tx.category?.id ?? null });
  }

  function applyMerchant(name: string, categoryId: string | null) {
    setMerchant(name);
    const rule = rules.find((item) => item.matchMerchant && item.actionCategoryId && sameMerchant(name, item.matchMerchant));
    const nextId = rule?.actionCategoryId ?? categoryId;
    if (!nextId) return;
    const cat = categories.find((item) => item.id === nextId);
    if (!cat) return;
    const income = cat.kind === "income";
    incomeMode.current = income;
    setIsIncome(income);
    setSelectedCatId(cat.id);
  }

  return (
    <Sheet
      title={pickingAccount ? "Account" : "Add"}
      onClose={pickingAccount ? () => setPickingAccount(false) : onClose}
      height="92%"
    >
      {pickingAccount ? (
        accounts.length ? (
          accounts.map((account) => (
            <MenuRow
              key={account.id}
              title={account.name}
              active={account.id === accountId}
              onPress={() => {
                setAccountId(account.id);
                setPickingAccount(false);
              }}
            />
          ))
        ) : (
          <Note>Add an account first.</Note>
        )
      ) : (
        <>
          <FlowToggle
            isIncome={isIncome}
            onChange={(income) => {
              incomeMode.current = income;
              setIsIncome(income);
              setSelectedCatId(pickQuickCategory(categories, income)?.id ?? null);
            }}
          />

          <View ref={padAmount.ref} onLayout={padAmount.onLayout} collapsable={false} style={{ alignItems: "center" }}>
            <RollingFigure
              text={`${isIncome && cents > 0 ? "+" : ""}${money(cents)}`}
              duration={160}
              style={{
                fontSize: 48,
                fontWeight: "700",
                letterSpacing: -2,
                textAlign: "center",
                color: isIncome ? palette.positive : palette.ink,
                fontVariant: ["tabular-nums"],
              }}
            />
          </View>
          {plannedCents > 0 && cents > 0 ? (
            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                textAlign: "center",
                color: nextLeft < 0 ? palette.danger : palette.muted,
                fontVariant: ["tabular-nums"],
              }}
            >
              {`Left to spend ${money(nextLeft)}`}
            </Text>
          ) : null}
          {planRow && nextCategory != null && cents > 0 ? (
            <Text
              style={{
                fontSize: 13,
                textAlign: "center",
                color: nextCategory < 0 ? palette.danger : palette.tertiary,
                fontVariant: ["tabular-nums"],
              }}
            >
              {nextCategory < 0
                ? `${planRow.category.name} · ${money(Math.abs(nextCategory))} over`
                : `${planRow.category.name} · ${money(nextCategory)} left`}
            </Text>
          ) : null}


          <Pressable
            onPress={() => setPickingAccount(true)}
            accessibilityRole="button"
            accessibilityLabel={accountName ? `Account ${accountName}` : "Choose an account"}
            style={{
              minHeight: 48,
              borderRadius: 14,
              borderCurve: "continuous",
              paddingHorizontal: 14,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)",
              borderWidth: 1,
              borderColor: palette.line,
            }}
          >
            <Text style={{ fontSize: 15, color: palette.muted }}>Account</Text>
            <Text style={{ fontSize: 15, fontWeight: "600", color: palette.ink }} numberOfLines={1}>
              {accountName || "Choose"}
            </Text>
          </Pressable>

          {merchantChips.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {merchantChips.map((chip) => {
                const selected = merchant.trim().toLowerCase() === chip.name.toLowerCase();
                return (
                  <Pressable
                    key={chip.name}
                    onPress={() => {
                      tapSelect();
                      applyMerchant(chip.name, chip.categoryId);
                    }}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 99,
                      backgroundColor: selected
                        ? isDark
                          ? "rgba(255,255,255,0.18)"
                          : "rgba(0,0,0,0.1)"
                        : isDark
                          ? "rgba(255,255,255,0.06)"
                          : "rgba(0,0,0,0.04)",
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: selected ? "700" : "500", color: selected ? palette.ink : palette.muted }}>
                      {chip.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          <View
            ref={padMerchant.ref}
            onLayout={padMerchant.onLayout}
            collapsable={false}
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

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
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
                  <View
                    ref={selected ? padColor.ref : undefined}
                    onLayout={selected ? padColor.onLayout : undefined}
                    collapsable={false}
                    style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cat.color || palette.accent }}
                  />
                  <Text style={{ fontSize: 13, fontWeight: selected ? "700" : "500", color: selected ? palette.ink : palette.muted }}>
                    {cat.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {error ? <Note tone="danger">{error}</Note> : null}

          <View style={{ flexDirection: "row", justifyContent: "center", gap: 8 }}>
            {[5, 10, 20, 50].map((preset) => (
              <Pressable
                key={preset}
                onPress={() => {
                  tapSelect();
                  setAmount(String(preset));
                }}
                style={({ pressed }) => [
                  {
                    paddingHorizontal: 13,
                    paddingVertical: 6,
                    borderRadius: 99,
                    backgroundColor: amount === String(preset) ? (isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.1)") : isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.05)",
                    borderWidth: 1,
                    borderColor: palette.glassBorderSubtle,
                  },
                  pressed ? { opacity: 0.7, transform: [{ scale: 0.96 }] } : null,
                ]}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: palette.ink, fontVariant: ["tabular-nums"] }}>
                  {`$${preset}`}
                </Text>
              </Pressable>
            ))}
          </View>

          <NumberPad
            hasDecimal
            onKey={(digit) => setAmount((current) => pushDigit(current, digit))}
            onDecimal={() => setAmount((current) => (current.includes(".") ? current : `${current || "0"}.`))}
            onClear={() => setAmount("")}
            onBackspace={() => setAmount((current) => current.slice(0, -1))}
          />

          <Pressable
            onPress={handleSave}
            disabled={busy || cents <= 0 || !accountId}
            style={({ pressed }) => [
              {
                height: 52,
                borderRadius: 18,
                borderCurve: "continuous",
                backgroundColor: cents > 0 && accountId ? (isIncome ? palette.positive : palette.control) : isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
                alignItems: "center",
                justifyContent: "center",
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
                  color: cents > 0 && accountId ? palette.controlInk : palette.tertiary,
                  letterSpacing: -0.3,
                }}
              >
                {saveLabel}
              </Text>
            )}
          </Pressable>
        </>
      )}
    </Sheet>
  );
}

function makeStyles(colors: Palette) {
  const isDark = colors.scheme === "dark";
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    scroll: { paddingHorizontal: 16, paddingBottom: 100, gap: 24 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      minHeight: 40,
      marginBottom: 2,
    },
    toolbar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      minHeight: 40,
      marginBottom: -8,
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
    title: { fontSize: 34, lineHeight: 40, fontWeight: "700", letterSpacing: -0.9, color: colors.ink },
    subtitle: { marginTop: 4, fontSize: 15, lineHeight: 20, color: colors.muted, letterSpacing: -0.2 },
    card: {
      backgroundColor: colors.card,
      borderRadius: 18,
      borderCurve: "continuous",
      overflow: "hidden",
    },
    cardProminent: {
      shadowColor: "#000",
      shadowOpacity: isDark ? 0 : 0.05,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    groupedCard: {
      backgroundColor: colors.card,
      borderRadius: 18,
      borderCurve: "continuous",
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
      backgroundColor: isDark ? colors.fill : colors.cardInset,
      borderCurve: "continuous",
    },
    field: { gap: 6 },
    label: { fontSize: 13, fontWeight: "500", color: colors.muted, letterSpacing: -0.1 },
    input: {
      backgroundColor: colors.fill,
      borderRadius: 12,
      borderCurve: "continuous",
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
      minHeight: 50,
      paddingHorizontal: 22,
      alignItems: "center",
      justifyContent: "center",
    },
    buttonBlock: { alignSelf: "stretch" },
    quiet: {
      backgroundColor: colors.fill,
      overflow: "hidden",
    },
    danger: { backgroundColor: colors.danger },
    buttonText: { color: colors.controlInk, fontSize: 16, fontWeight: "600", letterSpacing: -0.3 },
    quietText: { color: colors.ink },
    row: {
      backgroundColor: colors.card,
      borderRadius: 20,
      borderCurve: "continuous",
      borderColor: colors.line,
      paddingHorizontal: 16,
      minHeight: 56,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
    },
    section: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12, paddingHorizontal: 4, marginBottom: -2 },
    sectionTitle: { flexShrink: 1, fontSize: 20, lineHeight: 25, fontWeight: "700", color: colors.ink, letterSpacing: -0.5 },
    sectionSmall: { marginBottom: -6 },
    sectionTitleSmall: { flexShrink: 1, fontSize: 13, fontWeight: "600", color: colors.muted, letterSpacing: -0.1 },
    sectionTrailSmall: { fontSize: 13, fontWeight: "600", color: colors.muted, letterSpacing: -0.1, fontVariant: ["tabular-nums"] },
    sectionTrail: { fontSize: 15, fontWeight: "500", color: colors.muted, letterSpacing: -0.2, fontVariant: ["tabular-nums"] },
    sectionAction: { fontSize: 15, fontWeight: "500", color: colors.accentInk, letterSpacing: -0.2 },
    ledger: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minHeight: 60,
      paddingHorizontal: 16,
      paddingVertical: 12,
      position: "relative",
    },
    ledgerCompact: {
      minHeight: 50,
      paddingVertical: 8,
    },
    hairline: {
      position: "absolute",
      top: 0,
      right: 0,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.line,
    },
    menuGlyph: { width: 32, height: 32, borderRadius: 9, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.fill },
    divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
    ledgerCopy: { flex: 1, gap: 2 },
    meta: { fontSize: 13, lineHeight: 17, color: colors.muted, letterSpacing: -0.1 },
    amount: { fontSize: 16, fontWeight: "600", color: colors.ink, letterSpacing: -0.3, fontVariant: ["tabular-nums"] },
    rowTitle: { flex: 1, fontSize: 16, lineHeight: 21, fontWeight: "500", color: colors.ink, letterSpacing: -0.3 },
    rowDetail: { fontSize: 15, color: colors.muted, letterSpacing: -0.1 },
    note: { color: colors.muted, fontSize: 15, lineHeight: 21, letterSpacing: -0.1 },
    loading: { paddingVertical: 24, alignItems: "center", gap: 8 },
    hero: {
      paddingTop: 8,
      paddingHorizontal: 4,
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
    pacingFigure: {
      fontSize: 42,
      fontWeight: "700",
      letterSpacing: -1.6,
      color: colors.ink,
      fontVariant: ["tabular-nums"],
    },
    pacingCaption: {
      fontSize: 15,
      lineHeight: 20,
      color: colors.muted,
      letterSpacing: -0.2,
      fontVariant: ["tabular-nums"],
    },
    heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    heroLabel: { fontSize: 15, fontWeight: "500", color: colors.muted, letterSpacing: -0.2 },
    heroFigure: { marginTop: 2, fontSize: 46, fontWeight: "700", letterSpacing: -1.8, color: colors.ink, fontVariant: ["tabular-nums"] },
    heroEmpty: { fontSize: 28, fontWeight: "500", letterSpacing: -0.6, color: colors.muted },
    heroFooter: { marginTop: 14, paddingHorizontal: 0, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, fontSize: 13, color: colors.muted },
    status: { fontSize: 15, fontWeight: "600", color: colors.muted, letterSpacing: -0.2 },
    chartTag: { position: "absolute", fontSize: 10, fontWeight: "700", letterSpacing: 1, color: colors.tertiary, textTransform: "uppercase" },
    facts: {
      marginTop: 8,
      paddingTop: 14,
      paddingBottom: 4,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
      flexDirection: "row",
      gap: 12,
    },
    kicker: { fontSize: 13, fontWeight: "500", color: colors.muted, letterSpacing: -0.1 },
    factValue: { fontSize: 17, fontWeight: "600", letterSpacing: -0.4, color: colors.ink, fontVariant: ["tabular-nums"] },
    mix: { flexDirection: "row", height: 8, gap: 2, backgroundColor: colors.fill, borderRadius: 99, overflow: "hidden" },
    track: { height: 6, borderRadius: 99, backgroundColor: colors.fill, overflow: "hidden" },
    monthNav: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.fill,
      borderRadius: 19,
      borderCurve: "continuous",
      paddingHorizontal: 4,
      paddingVertical: 2,
      overflow: "hidden",
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
      backgroundColor: colors.fill,
      overflow: "hidden",
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
      backgroundColor: colors.fill,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    banner: {
      minHeight: 60,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 22,
      borderCurve: "continuous",
      backgroundColor: colors.card,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      overflow: "hidden",
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
      backgroundColor: colors.fill,
      borderRadius: 16,
      borderCurve: "continuous",
      minHeight: 44,
      paddingHorizontal: 14,
      gap: 10,
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
