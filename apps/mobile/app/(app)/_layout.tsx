import { router, Tabs, usePathname } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, api, load, peek, subscribeCache } from "../../src/api";
import { tapPress, tapSelect } from "../../src/haptic";
import { Icon } from "../../src/icons";
import { dashboardPath, money, sameMerchant } from "../../src/format";
import { ISLAND_RECT, islandChargeId, syncIsland, type IslandTx } from "../../src/island";
import {
  anchorRect,
  emitShelfRefresh,
  launchLeftToPlan,
  launchPlanToToday,
  peekCategoryReturn,
  playFlight,
  setFlightSurface,
  takeCategoryReturn,
  useMeasuredAnchor,
} from "../../src/flight";
import { subscribeOutbox } from "../../src/review-outbox";
import { useReduceMotion, useReduceTransparency, useTheme } from "../../src/theme";
import { colors, QuickLogModal, type QuickLogDraft } from "../../src/ui";

const TABS = [
  { name: "index", title: "Today", icon: "home" },
  { name: "budget", title: "Plan", icon: "chart" },
  { name: "activity", title: "Activity", icon: "list" },
] as const;

function MobileBar({
  title,
  unread,
  syncLabel,
}: {
  title: string;
  unread: number;
  syncLabel: string;
}) {
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const reduceTransparency = useReduceTransparency();
  const isDark = palette.scheme === "dark";
  const failed = syncLabel === "Sync failed";
  const syncMeasure = useMeasuredAnchor(syncLabel === "Syncing" ? "sync.chip" : null, {
    text: syncLabel,
    color: palette.muted,
    fontSize: 12,
  });
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
        borderBottomColor: palette.line,
        overflow: "hidden",
      }}
    >
      {!reduceTransparency ? (
        <BlurView intensity={isDark ? 60 : 80} tint={palette.blurTint} style={StyleSheet.absoluteFill} />
      ) : null}
      <View
        style={{
          height: 52,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: 20,
          paddingRight: 12,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10, flexShrink: 1 }}>
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            style={{ fontSize: 28, fontWeight: "700", letterSpacing: -0.8, color: palette.ink }}
          >
            {title}
          </Text>
          {syncLabel === "Syncing" || failed ? (
            <View ref={syncMeasure.ref} onLayout={syncMeasure.onLayout} collapsable={false} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: failed ? palette.danger : palette.tertiary }} />
              <Text style={{ fontSize: 12, fontWeight: "500", color: failed ? palette.danger : palette.muted }} numberOfLines={1}>
                {failed ? "Sync failed" : "Syncing"}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={unread ? `Notifications, ${unread} unread` : "Notifications"}
            onPress={() => {
              tapPress();
              router.push("/notifications");
            }}
            style={({ pressed }) => [barButton, { backgroundColor: palette.fill }, pressed ? { opacity: 0.6 } : null]}
            hitSlop={4}
          >
            <Icon name="bell" size={18} color={palette.ink} />
            {unread ? <View style={[unreadDot, { backgroundColor: palette.danger, borderColor: palette.fill }]} /> : null}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={() => {
              tapPress();
              router.push("/settings");
            }}
            style={({ pressed }) => [barButton, { backgroundColor: palette.fill }, pressed ? { opacity: 0.6 } : null]}
            hitSlop={4}
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
  const label = { fontSize: 11, letterSpacing: -0.1, marginTop: 0 } as const;
  return (
    <View style={{ alignItems: "center", marginTop: 2, flexShrink: 0 }}>
      <Text style={{ ...label, fontWeight: "700", opacity: 0 }} numberOfLines={1}>
        {title}
      </Text>
      <Animated.View style={{ opacity: idle, position: "absolute", left: 0, right: 0, top: 0, alignItems: "center" }}>
        <Text style={{ ...label, fontWeight: "500", color: palette.tertiary }} numberOfLines={1}>
          {title}
        </Text>
      </Animated.View>
      <Animated.View style={{ opacity: fade, position: "absolute", left: 0, right: 0, top: 0, alignItems: "center" }}>
        <Text style={{ ...label, fontWeight: "700", color: palette.accentInk }} numberOfLines={1}>
          {title}
        </Text>
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
}: {
  route: { key: string; name: string };
  focused: boolean;
  reviewCount: number;
  spec?: { name: string; title: string; icon: string };
  onPress: () => void;
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
      onPressIn={() => {
        if (reduceMotion) return;
        Animated.spring(scale, { toValue: 0.9, useNativeDriver: true, stiffness: 600, damping: 24 }).start();
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
        minHeight: 52,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 6,
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
  const reduceMotion = useReduceMotion();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Log a purchase"
      onPressIn={() => {
        if (reduceMotion) return;
        Animated.spring(scale, { toValue: 0.9, useNativeDriver: true, stiffness: 600, damping: 24 }).start();
      }}
      onPressOut={() => {
        if (reduceMotion) return;
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, stiffness: 600, damping: 24 }).start();
      }}
      onPress={() => {
        tapPress();
        onPress();
      }}
    >
      <Animated.View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          borderCurve: "continuous",
          backgroundColor: palette.accent,
          alignItems: "center",
          justifyContent: "center",
          transform: [{ scale }],
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: palette.scheme === "dark" ? 0.5 : 0.18,
          shadowRadius: 14,
          elevation: 8,
        }}
      >
        <Icon name="plus" size={26} color="#ffffff" />
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
  const activeName = state.routes[state.index]?.name ?? "index";
  const activeIndex = Math.max(0, TABS.findIndex((tab) => tab.name === activeName));
  // Tabs share the row equally, so the highlight only ever moves sideways.
  // translateX runs on the native driver, so a tab mounting on the JS thread cannot stall it.
  const [slot, setSlot] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);

  useEffect(() => {
    if (!slot) return;
    const to = activeIndex * slot;
    if (!placed.current || reduceMotion) {
      x.setValue(to);
      placed.current = true;
      return;
    }
    Animated.spring(x, { toValue: to, useNativeDriver: true, stiffness: 520, damping: 40, mass: 0.8 }).start();
  }, [activeIndex, slot, reduceMotion, x]);

  const visibleRoutes = state.routes.filter((route) => TABS.some((tab) => tab.name === route.name));

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        paddingBottom: Math.max(insets.bottom, 14),
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      <View
        style={{
          flex: 1,
          height: 64,
          borderRadius: 32,
          borderCurve: "continuous",
          backgroundColor: reduceTransparency ? palette.card : palette.dockBg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: palette.lineStrong,
          padding: 6,
          overflow: "hidden",
          shadowColor: "#000",
          shadowOpacity: isDark ? 0.5 : 0.1,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 8 },
          elevation: 10,
        }}
      >
        {!reduceTransparency ? (
          <BlurView intensity={isDark ? 60 : 75} tint={palette.blurTint} style={StyleSheet.absoluteFill} />
        ) : null}
        <View
          style={{ flex: 1, flexDirection: "row" }}
          onLayout={(event) => setSlot(event.nativeEvent.layout.width / TABS.length)}
        >
          {slot ? (
            <Animated.View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 0,
                width: slot,
                borderRadius: 26,
                borderCurve: "continuous",
                backgroundColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.055)",
                transform: [{ translateX: x }],
              }}
            />
          ) : null}
          {TABS.map((spec) => {
            const route = visibleRoutes.find((item) => item.name === spec.name);
            if (!route) return null;
            const focused = activeName === spec.name;
            return (
              <ShelfTabBarItem
                key={route.key}
                route={route}
                focused={focused}
                reviewCount={reviewCount}
                spec={spec}
                onPress={() => onPress(route, focused)}
              />
            );
          })}
        </View>
      </View>
      <ShelfQuickLogButton onPress={onQuickLog} />
    </View>
  );
}

const barButton = { width: 36, height: 36, borderRadius: 18, alignItems: "center" as const, justifyContent: "center" as const };
const unreadDot = { position: "absolute" as const, right: 6, top: 6, width: 9, height: 9, borderRadius: 4.5, borderWidth: 1.5 };
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
          const listed = peek<{ transactions?: IslandTx[] }>("/api/transactions?")?.transactions ?? [];
          syncIsland(listed);
          const onIsland = islandChargeId();
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
              from: tx.id === onIsland ? ISLAND_RECT : fromChip,
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

    void load<{ unreviewed: number }>("/api/transactions?countOnly=1")
      .then((res) => setReviewCount(res.unreviewed))
      .catch(() => undefined);
    void load<{ notifications: unknown[]; unread: number }>("/api/notifications")
      .then((res) => setUnread(res.unread))
      .catch(() => undefined);

    const unsubCount = subscribeCache<{ unreviewed: number }>("/api/transactions?countOnly=1", (res) => {
      if (res && typeof res.unreviewed === "number") setReviewCount(res.unreviewed);
    });
    const unsubNotes = subscribeCache<{ unread: number }>("/api/notifications", (res) => {
      if (res && typeof res.unread === "number") setUnread(res.unread);
    });
    const unsubOutbox = subscribeOutbox((reason) => {
      if (reason !== "hydrated" && reason !== "settled") return;
      void load("/api/transactions?countOnly=1").catch(() => undefined);
      void load(dashboardPath()).catch(() => undefined);
    });
    return () => {
      unsubCount();
      unsubNotes();
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
  const onAccounts = path.startsWith("/account/");
  const onToday = !onBudget && !onActivity && !onAccounts;
  useEffect(() => {
    if (onToday) setFlightSurface("today");
    else if (onBudget) setFlightSurface("plan");
    else if (onActivity) setFlightSurface("activity");
    else setFlightSurface("other");
  }, [onToday, onBudget, onActivity]);
  const showBar = onToday || onBudget || onActivity;

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
            header: () => <MobileBar title="Today" unread={unread} syncLabel={syncLabel} />,
          }}
        />
        <Tabs.Screen
          name="budget"
          options={{
            title: "Plan",
            headerShown: showBar && onBudget,
            headerTransparent: true,
            header: () => <MobileBar title="Plan" unread={unread} syncLabel={syncLabel} />,
          }}
        />
        <Tabs.Screen
          name="activity"
          options={{
            title: "Activity",
            headerShown: showBar && onActivity,
            headerTransparent: true,
            header: () => <MobileBar title="Activity" unread={unread} syncLabel={syncLabel} />,
          }}
        />
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
