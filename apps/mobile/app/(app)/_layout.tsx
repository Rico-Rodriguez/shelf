import { router, Tabs, usePathname } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, AppState, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, api, load, peek, subscribeCache } from "../../src/api";
import { tapPress, tapSelect } from "../../src/haptic";
import { useWordmark } from "../../src/brand";
import { Icon } from "../../src/icons";
import { dashboardPath, money, netWorthCents, sameMerchant, type NetWorthAccount } from "../../src/format";
import {
  anchorRect,
  emitShelfRefresh,
  launchLeftToPlan,
  launchPlanToToday,
  peekCategoryReturn,
  playFlight,
  recallAnchor,
  setFlightSurface,
  stageFlight,
  takeCategoryReturn,
  useMeasuredAnchor,
} from "../../src/flight";
import { subscribeOutbox } from "../../src/review-outbox";
import { useReduceMotion, useReduceTransparency, useTheme } from "../../src/theme";
import { colors, QuickLogModal, RollingFigure, type QuickLogDraft } from "../../src/ui";

const TABS = [
  { name: "index", title: "Today", icon: "home" },
  { name: "budget", title: "Plan", icon: "chart" },
  { name: "activity", title: "Activity", icon: "list" },
] as const;

function MobileBar({
  unread,
  syncLabel,
  netWorth,
}: {
  unread: number;
  syncLabel: string;
  netWorth: number | null;
}) {
  const insets = useSafeAreaInsets();
  const wordmark = useWordmark();
  const { palette } = useTheme();
  const reduceTransparency = useReduceTransparency();
  const isDark = palette.scheme === "dark";
  const syncMeasure = useMeasuredAnchor(syncLabel === "Syncing" ? "sync.chip" : null, {
    text: syncLabel,
    color: palette.muted,
    fontSize: 10,
  });
  const worthMeasure = useMeasuredAnchor(netWorth === null ? null : "worth.pill", netWorth === null ? null : { text: money(netWorth), color: palette.ink, fontSize: 13 });
  const reduceMotion = useReduceMotion();

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        paddingTop: insets.top,
        backgroundColor: reduceTransparency ? palette.bg : palette.navBg,
        borderBottomWidth: StyleSheet.hairlineWidth,
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
          minHeight: 50,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: 16,
          paddingRight: 12,
        }}
      >
        {/* Brand Wordmark & Live Sync Pill */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text
            style={{
              fontFamily: wordmark,
              fontSize: 22,
              fontWeight: "600",
              letterSpacing: -0.6,
              color: palette.ink,
            }}
          >
            Shelf
          </Text>
          {syncLabel === "Syncing" || syncLabel === "Sync failed" ? (
            <View
              ref={syncMeasure.ref}
              onLayout={syncMeasure.onLayout}
              collapsable={false}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderRadius: 99,
                backgroundColor:
                  syncLabel === "Sync failed"
                    ? isDark
                      ? "rgba(255, 107, 74, 0.16)"
                      : "rgba(217, 74, 46, 0.1)"
                    : isDark
                      ? "rgba(255, 255, 255, 0.08)"
                      : "rgba(0, 0, 0, 0.05)",
              }}
            >
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 2.5,
                  backgroundColor:
                    syncLabel === "Sync failed"
                      ? palette.danger
                      : palette.warn,
                }}
              />
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "600",
                  letterSpacing: -0.1,
                  color: syncLabel === "Sync failed" ? palette.danger : palette.muted,
                }}
                numberOfLines={1}
              >
                {syncLabel}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Right Chrome Controls: Floating Net Worth Pill, Bell, Gear */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {netWorth !== null ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Net worth ${money(netWorth)}, view accounts`}
              onPress={() => {
                tapPress();
                const from = anchorRect("worth.pill");
                const remembered = recallAnchor("worth.pill");
                if (from && remembered) {
                  stageFlight(
                    {
                      id: "worth-open",
                      hide: ["worth.hero"],
                      pieces: [
                        {
                          key: "worth",
                          text: remembered.text,
                          color: remembered.color,
                          fontSize: remembered.fontSize,
                          fontWeight: "700",
                          from,
                          toAnchor: "worth.hero",
                          toFontSize: 46,
                        },
                      ],
                    },
                    reduceMotion,
                  );
                }
                router.push("/(app)/accounts");
              }}
              style={({ pressed }) => [
                {
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 99,
                  borderCurve: "continuous",
                  backgroundColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                  borderWidth: 1,
                  borderColor: palette.glassBorderSubtle,
                },
                pressed ? { opacity: 0.75, transform: [{ scale: 0.96 }] } : null,
              ]}
              hitSlop={6}
            >
              <Icon name="wallet" size={13} color={palette.accentInk} filled />
              <View ref={worthMeasure.ref} onLayout={worthMeasure.onLayout} collapsable={false}>
              <RollingFigure
                text={money(netWorth)}
                duration={360}
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: palette.ink,
                  fontVariant: ["tabular-nums"],
                  letterSpacing: -0.2,
                }}
              />
              </View>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityLabel="Notifications"
            onPress={() => {
              tapPress();
              router.push("/notifications");
            }}
            style={barButton}
            hitSlop={8}
          >
            <Icon name="bell" size={18} color={palette.ink} />
            {unread ? <View style={[unreadDot, { backgroundColor: palette.danger }]} /> : null}
          </Pressable>

          <Pressable
            accessibilityLabel="Settings"
            onPress={() => {
              tapPress();
              router.push("/settings");
            }}
            style={barButton}
            hitSlop={8}
          >
            <Icon name="gear" size={18} color={palette.ink} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function CrossfadeLabel({
  focused,
  title,
}: {
  focused: boolean;
  title: string;
}) {
  const { palette } = useTheme();
  const reduceMotion = useReduceMotion();
  const fade = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) {
      fade.setValue(focused ? 1 : 0);
      return;
    }
    Animated.timing(fade, { toValue: focused ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [focused, reduceMotion, fade]);
  const idle = fade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const label = { fontSize: 11, letterSpacing: -0.1, marginTop: 2 } as const;
  return (
    <View style={{ alignItems: "center", marginTop: 2 }}>
      <Animated.View style={{ opacity: idle }}>
        <Text style={{ ...label, marginTop: 0, fontWeight: "500", color: palette.tertiary }}>{title}</Text>
      </Animated.View>
      <Animated.View style={{ opacity: fade, position: "absolute", left: 0, right: 0, top: 0, alignItems: "center" }}>
        <Text style={{ ...label, marginTop: 0, fontWeight: "700", color: palette.accentInk }}>{title}</Text>
      </Animated.View>
    </View>
  );
}

function ShelfTabBarItem({
  route,
  focused,
  reviewCount,
  spec,
  onPress,
  onLayout,
}: {
  route: { key: string; name: string };
  focused: boolean;
  reviewCount: number;
  spec?: { name: string; title: string; icon: string };
  onPress: () => void;
  onLayout: (event: { nativeEvent: { layout: { x: number; width: number } } }) => void;
}) {
  const { palette } = useTheme();
  const reduceMotion = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const iconFade = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) {
      iconFade.setValue(focused ? 1 : 0);
      return;
    }
    Animated.timing(iconFade, { toValue: focused ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [focused, reduceMotion, iconFade]);
  const iconIdle = iconFade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={
        route.name === "activity" && reviewCount > 0
          ? `Activity, ${reviewCount} to categorize`
          : spec?.title
      }
      onLayout={onLayout}
      onPressIn={() => {
        if (reduceMotion) return;
        Animated.spring(scale, { toValue: 0.90, useNativeDriver: true, stiffness: 600, damping: 24 }).start();
      }}
      onPressOut={() => {
        if (reduceMotion) return;
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, stiffness: 600, damping: 24 }).start();
      }}
      onPress={() => {
        if (!focused) tapSelect();
        onPress();
      }}
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 6,
        paddingHorizontal: 4,
        borderRadius: 22,
        borderCurve: "continuous",
      }}
    >
      <Animated.View style={{ position: "relative", alignItems: "center", transform: [{ scale }] }}>
        <View style={{ width: 21, height: 21 }}>
          <Animated.View style={{ opacity: iconIdle, position: "absolute" }}>
            <Icon name={spec?.icon ?? "more"} size={21} color={palette.tertiary} />
          </Animated.View>
          <Animated.View style={{ opacity: iconFade }}>
            <Icon name={spec?.icon ?? "more"} size={21} color={palette.accentInk} filled />
          </Animated.View>
        </View>
        {route.name === "activity" && reviewCount > 0 ? (
          <View style={[badge, { backgroundColor: palette.danger }]}>
            <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
              {reviewCount > 99 ? "99+" : reviewCount}
            </Text>
          </View>
        ) : null}
        <CrossfadeLabel focused={focused} title={spec?.title ?? ""} />
      </Animated.View>
    </Pressable>
  );
}

function ShelfQuickLogButton({ onPress }: { onPress: () => void }) {
  const { palette } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Quick log expense"
      onPressIn={() => {
        Animated.spring(scale, { toValue: 0.88, useNativeDriver: true, stiffness: 600, damping: 24 }).start();
      }}
      onPressOut={() => {
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, stiffness: 600, damping: 24 }).start();
      }}
      onPress={() => {
        tapPress();
        onPress();
      }}
      style={{
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 6,
      }}
    >
      <Animated.View
        style={{
          width: 46,
          height: 46,
          borderRadius: 23,
          borderCurve: "continuous",
          backgroundColor: palette.control,
          alignItems: "center",
          justifyContent: "center",
          transform: [{ scale }],
          borderWidth: 1,
          borderColor: palette.scheme === "dark" ? "rgba(255, 255, 255, 0.25)" : "rgba(255, 255, 255, 0.35)",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: palette.scheme === "dark" ? 0.35 : 0.2,
          shadowRadius: 10,
          elevation: 5,
        }}
      >
        <Icon name="plus" size={22} color={palette.controlInk} />
      </Animated.View>
    </Pressable>
  );
}

function ShelfTabBar({
  state,
  reviewCount,
  onPress,
  onQuickLog,
}: {
  state: { index: number; routes: { key: string; name: string }[] };
  reviewCount: number;
  onPress: (route: { key: string; name: string }, focused: boolean) => void;
  onQuickLog: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const reduceTransparency = useReduceTransparency();
  const reduceMotion = useReduceMotion();
  const isDark = palette.scheme === "dark";
  const capsuleX = useRef(new Animated.Value(0)).current;
  const capsuleW = useRef(new Animated.Value(0)).current;
  const layouts = useRef<Record<string, { x: number; width: number }>>({});
  const capsuleReady = useRef(false);
  const activeName = state.routes[state.index]?.name ?? "index";

  function placeCapsule(name: string, animate: boolean) {
    const layout = layouts.current[name];
    if (!layout) return;
    if (!animate || reduceMotion || !capsuleReady.current) {
      capsuleX.setValue(layout.x);
      capsuleW.setValue(layout.width);
      capsuleReady.current = true;
      return;
    }
    Animated.parallel([
      Animated.spring(capsuleX, { toValue: layout.x, useNativeDriver: false, stiffness: 420, damping: 34, mass: 0.7 }),
      Animated.spring(capsuleW, { toValue: layout.width, useNativeDriver: false, stiffness: 420, damping: 34, mass: 0.7 }),
    ]).start();
  }

  useEffect(() => {
    placeCapsule(activeName, true);
  }, [activeName, reduceMotion]);

  // Filter routes to primary tabs only
  const visibleRoutes = state.routes.filter((route) =>
    TABS.some((tab) => tab.name === route.name),
  );

  function tabItem(name: (typeof TABS)[number]["name"]) {
    const route = visibleRoutes.find((item) => item.name === name);
    if (!route) return null;
    const focused = activeName === name;
    const spec = TABS.find((tab) => tab.name === name);
    return (
      <ShelfTabBarItem
        key={route.key}
        route={route}
        focused={focused}
        reviewCount={reviewCount}
        spec={spec}
        onPress={() => onPress(route, focused)}
        onLayout={(event) => {
          layouts.current[name] = { x: event.nativeEvent.layout.x, width: event.nativeEvent.layout.width };
          if (focused) placeCapsule(name, false);
        }}
      />
    );
  }

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        paddingBottom: Math.max(insets.bottom, 12),
        paddingHorizontal: 20,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: reduceTransparency
            ? isDark
              ? "#1a1e26"
              : "#ffffff"
            : palette.dockBg,
          borderRadius: 36,
          borderCurve: "continuous",
          borderWidth: 1,
          borderTopColor: palette.specularTop || "rgba(255, 255, 255, 0.45)",
          borderBottomColor: palette.specularBottom || "rgba(255, 255, 255, 0.12)",
          borderLeftColor: palette.specularSides || "rgba(255, 255, 255, 0.18)",
          borderRightColor: palette.specularSides || "rgba(255, 255, 255, 0.18)",
          paddingVertical: 6,
          paddingHorizontal: 8,
          overflow: "hidden",
          shadowColor: "#000",
          shadowOpacity: isDark ? 0.45 : 0.12,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 8 },
          elevation: 10,
        }}
      >
        {!reduceTransparency ? (
          <BlurView
            intensity={isDark ? 60 : 75}
            tint={palette.blurTint}
            style={StyleSheet.absoluteFill}
          />
        ) : null}

        <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: capsuleX,
              width: capsuleW,
              borderRadius: 22,
              backgroundColor: isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.05)",
            }}
          />
          {tabItem("index")}
          {tabItem("budget")}
          <ShelfQuickLogButton onPress={onQuickLog} />
          {tabItem("activity")}
        </View>
      </View>
    </View>
  );
}

const barButton = { width: 36, height: 36, alignItems: "center" as const, justifyContent: "center" as const };
const unreadDot = { position: "absolute" as const, right: 8, top: 8, width: 7, height: 7, borderRadius: 3.5 };
const badge = {
  position: "absolute" as const,
  top: -4,
  right: -10,
  minWidth: 16,
  height: 16,
  borderRadius: 8,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  paddingHorizontal: 4,
};

export default function AppTabs() {
  const path = usePathname();
  const reduceMotion = useReduceMotion();
  const reduceRef = useRef(reduceMotion);
  reduceRef.current = reduceMotion;
  const seenSync = useRef<Map<string, boolean>>(new Map());
  const [reviewCount, setReviewCount] = useState(0);
  const [unread, setUnread] = useState(0);
  const [syncLabel, setSyncLabel] = useState("");
  const [netWorth, setNetWorth] = useState<number | null>(null);
  const [hasPlan, setHasPlan] = useState(false);
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [quickDraft, setQuickDraft] = useState<QuickLogDraft | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = (pendingOnly: boolean) => {
      setSyncLabel("Syncing");
      const before = peek<{ transactions?: { id: string; name: string; merchantName?: string | null; amountCents: number; pending?: boolean }[] }>(dashboardPath());
      const known = new Map(seenSync.current);
      for (const tx of before?.transactions ?? []) {
        if (!known.has(tx.id)) known.set(tx.id, Boolean(tx.pending));
      }
      const chip = anchorRect("sync.chip");
      const pendingFrom = anchorRect("today.pending");
      const bills = peek<{ recurrences?: { merchantName: string; isIncome?: boolean; isActive?: boolean }[] }>("/api/recurring")?.recurrences ?? [];
      void api("/api/plaid/sync", { method: "POST", body: JSON.stringify({ pendingOnly }) })
        .then(async () => {
          if (!alive) return;
          const now = new Date();
          await Promise.all([
            load(dashboardPath()).catch(() => undefined),
            load("/api/transactions?").catch(() => undefined),
            load(`/api/budget?year=${now.getFullYear()}&month=${now.getMonth() + 1}`).catch(() => undefined),
          ]);
          if (!alive) return;
          emitShelfRefresh();
          const after = peek<{ transactions?: { id: string; name: string; merchantName?: string | null; amountCents: number; pending?: boolean }[] }>(dashboardPath());
          const rows = after?.transactions ?? [];
          const hadBaseline = known.size > 0;
          const arrivals = hadBaseline ? rows.filter((tx) => !known.has(tx.id)) : [];
          const posted = hadBaseline ? rows.filter((tx) => known.get(tx.id) === true && tx.pending === false) : [];
          const nextKnown = new Map(known);
          for (const tx of rows) nextKnown.set(tx.id, Boolean(tx.pending));
          seenSync.current = nextKnown;
          const fromChip = chip ?? { x: 24, y: 52, width: 78, height: 18 };
          const pieces = [];
          let delay = 0;
          for (const tx of arrivals) {
            const label = tx.merchantName || tx.name;
            const bill = bills.some((row) => row.isIncome !== true && row.isActive !== false && sameMerchant(row.merchantName, label));
            if (bill) continue;
            pieces.push({
              key: tx.id,
              text: label,
              meta: money(Math.abs(tx.amountCents)),
              color: tx.pending ? colors.tertiary : colors.ink,
              fontSize: 13,
              fontWeight: "600" as const,
              from: fromChip,
              toAnchor: `today.tx.${tx.id}`,
              toFontSize: 16,
              delay,
            });
            delay += 50;
          }
          for (const tx of posted) {
            pieces.push({
              key: `post-${tx.id}`,
              text: money(Math.abs(tx.amountCents)),
              color: colors.tertiary,
              toColor: colors.ink,
              fontSize: 15,
              fontWeight: "700" as const,
              from: pendingFrom ?? anchorRect(`today.tx.${tx.id}.amount`) ?? fromChip,
              toAnchor: "today.left",
              toFontSize: 46,
              delay,
            });
            delay += 40;
          }
          setSyncLabel("Up to date");
          if (pieces.length) playFlight({ id: "sync", hide: arrivals.map((tx) => `today.tx.${tx.id}`), pieces }, reduceRef.current);
        })
        .catch((err: unknown) => {
          if (!alive) return;
          setSyncLabel(err instanceof ApiError && err.status === 403 ? "Up to date" : "Sync failed");
        });
    };
    const now = new Date();
    const firstPaint = Promise.all(
      [
        dashboardPath(),
        "/api/accounts",
        "/api/categories",
        "/api/transactions?",
        `/api/budget?year=${now.getFullYear()}&month=${now.getMonth() + 1}`,
        "/api/transactions?countOnly=1",
        "/api/notifications",
        "/api/goals",
        "/api/investments",
      ].map((path) => load(path).catch(() => undefined)),
    );
    const gate = Promise.race([firstPaint, new Promise((resolve) => setTimeout(resolve, 4000))]);
    void gate.then(() => {
      if (alive) tick(false);
    });
    const focus = AppState.addEventListener("change", (state) => {
      if (state === "active") tick(true);
    });
    const pending = setInterval(() => tick(true), 60 * 1000);
    const full = setInterval(() => tick(false), 15 * 60 * 1000);
    return () => {
      alive = false;
      focus.remove();
      clearInterval(pending);
      clearInterval(full);
    };
  }, []);

  useEffect(() => {
    const counted = peek<{ unreviewed: number }>("/api/transactions?countOnly=1");
    if (counted) setReviewCount(counted.unreviewed);
    const notes = peek<{ unread: number }>("/api/notifications");
    if (notes) setUnread(notes.unread);

    const updateNetWorth = (accts?: NetWorthAccount[]) => {
      if (!accts) return;
      setNetWorth(netWorthCents(accts));
    };

    const cachedAccts = peek<{ accounts: NetWorthAccount[] }>("/api/accounts");
    if (cachedAccts?.accounts) updateNetWorth(cachedAccts.accounts);
    const cachedDash = peek<{ budget?: { plannedCents?: number } }>(dashboardPath());
    if (cachedDash) setHasPlan((cachedDash.budget?.plannedCents ?? 0) > 0);

    void load<{ unreviewed: number }>("/api/transactions?countOnly=1")
      .then((res) => setReviewCount(res.unreviewed))
      .catch(() => undefined);
    void load<{ notifications: unknown[]; unread: number }>("/api/notifications")
      .then((res) => setUnread(res.unread))
      .catch(() => undefined);
    void load<{ accounts: NetWorthAccount[] }>("/api/accounts")
      .then((res) => updateNetWorth(res.accounts))
      .catch(() => undefined);
    void load<{ budget?: { plannedCents?: number } }>(dashboardPath())
      .then((res) => setHasPlan((res.budget?.plannedCents ?? 0) > 0))
      .catch(() => undefined);

    const unsubCount = subscribeCache<{ unreviewed: number }>("/api/transactions?countOnly=1", (res) => {
      if (res && typeof res.unreviewed === "number") setReviewCount(res.unreviewed);
    });
    const unsubNotes = subscribeCache<{ unread: number }>("/api/notifications", (res) => {
      if (res && typeof res.unread === "number") setUnread(res.unread);
    });
    const unsubAccts = subscribeCache<{ accounts: NetWorthAccount[] }>("/api/accounts", (res) => {
      if (res?.accounts) updateNetWorth(res.accounts);
    });
    const unsubDash = subscribeCache<{ budget?: { plannedCents?: number } }>(dashboardPath(), (res) => {
      if (res) setHasPlan((res.budget?.plannedCents ?? 0) > 0);
    });
    const unsubOutbox = subscribeOutbox((reason) => {
      if (reason !== "hydrated" && reason !== "settled") return;
      void load("/api/transactions?countOnly=1").catch(() => undefined);
      void load(dashboardPath()).catch(() => undefined);
    });
    return () => {
      unsubCount();
      unsubNotes();
      unsubAccts();
      unsubDash();
      unsubOutbox();
    };
  }, [path]);

  const refreshAfterLog = () => {
    const now = new Date();
    return Promise.all([
      load(dashboardPath()).catch(() => undefined),
      load("/api/transactions?").catch(() => undefined),
      load(`/api/budget?year=${now.getFullYear()}&month=${now.getMonth() + 1}`).catch(() => undefined),
      load("/api/transactions?countOnly=1").catch(() => undefined),
      load("/api/accounts").catch(() => undefined),
    ]).then(() => undefined);
  };

  const onBudget = path.includes("budget");
  const onActivity = path.includes("activity");
  const onAccounts = path.includes("account");
  const onToday = !onBudget && !onActivity && !onAccounts;
  useEffect(() => {
    if (onToday) setFlightSurface("today");
    else if (onBudget) setFlightSurface("plan");
    else if (onActivity) setFlightSurface("activity");
    else setFlightSurface("other");
  }, [onToday, onBudget, onActivity]);
  const showBar = onToday || onBudget || onActivity;
  const showWorth = onBudget || onActivity || (onToday && hasPlan);

  return (
    <>
      <Tabs
        tabBar={(props) => (
          <ShelfTabBar
            state={props.state}
            reviewCount={reviewCount}
            onPress={(route, focused) => {
              if (!focused && route.name === "budget") launchLeftToPlan(reduceMotion);
              if (!focused && route.name === "index") launchPlanToToday(reduceMotion);
              if (!focused && path.includes("activity")) {
                const back = peekCategoryReturn();
                const from = anchorRect("activity.category.banner");
                if (back && from) {
                  playFlight(
                    {
                      id: "category-back",
                      pieces: [
                        {
                          key: "gather",
                          kind: "fill",
                          color: colors.accent,
                          fontSize: 12,
                          from,
                          to: anchorRect(back.anchor) ?? back.rect,
                        },
                      ],
                    },
                    reduceMotion,
                  );
                  takeCategoryReturn();
                }
              }
              const event = props.navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) props.navigation.navigate(route.name);
            }}
            onQuickLog={() => {
              setQuickDraft(null);
              setQuickError(null);
              setQuickLogOpen(true);
            }}
          />
        )}
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            elevation: 0,
            borderTopWidth: 0,
            backgroundColor: "transparent",
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Today",
            headerShown: showBar && onToday,
            headerTransparent: true,
            header: () => <MobileBar unread={unread} syncLabel={syncLabel} netWorth={showWorth ? netWorth : null} />,
          }}
        />
        <Tabs.Screen
          name="budget"
          options={{
            title: "Plan",
            headerShown: showBar && onBudget,
            headerTransparent: true,
            header: () => <MobileBar unread={unread} syncLabel={syncLabel} netWorth={showWorth ? netWorth : null} />,
          }}
        />
        <Tabs.Screen
          name="activity"
          options={{
            title: "Activity",
            headerShown: showBar && onActivity,
            headerTransparent: true,
            header: () => <MobileBar unread={unread} syncLabel={syncLabel} netWorth={showWorth ? netWorth : null} />,
          }}
        />
        <Tabs.Screen name="accounts" options={{ href: null, title: "Accounts" }} />
      </Tabs>

      {/* Global Frictionless Quick-Log Sheet */}
      <QuickLogModal
        visible={quickLogOpen}
        draft={quickDraft}
        initialError={quickError}
        onClose={() => setQuickLogOpen(false)}
        onSuccess={refreshAfterLog}
        onFail={(next, message) => {
          setQuickDraft(next);
          setQuickError(message);
          setQuickLogOpen(true);
        }}
      />
    </>
  );
}
