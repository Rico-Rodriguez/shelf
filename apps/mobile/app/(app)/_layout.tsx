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
  { name: "index", title: "Home", icon: "home" },
  { name: "activity", title: "Activity", icon: "list" },
  { name: "trends", title: "Insights", icon: "chart" },
] as const;

function MobileBar({
  title,
  unread,
  syncLabel,
  search = false,
}: {
  title: string;
  unread: number;
  syncLabel: string;
  search?: boolean;
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
          paddingRight: 14,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10, flexShrink: 1 }}>
          {title ? (
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              style={{ fontSize: 30, fontWeight: "700", letterSpacing: -0.9, color: palette.ink }}
            >
              {title}
            </Text>
          ) : null}
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
          {search ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Search"
              onPress={() => {
                tapPress();
                router.push("/search");
              }}
              style={({ pressed }) => [barButton, { backgroundColor: palette.fill }, pressed ? { opacity: 0.6 } : null]}
              hitSlop={4}
            >
              <Icon name="search" size={17} color={palette.ink} />
            </Pressable>
          ) : null}
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
            <Icon name="bell" size={17} color={palette.ink} />
            {unread ? <View style={[unreadDot, { backgroundColor: palette.warn, borderColor: palette.fill }]} /> : null}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function TabIcon({
  icon,
  label,
  focused,
  badge,
  onPress,
}: {
  icon: string;
  label: string;
  focused: boolean;
  badge?: number;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  const reduceMotion = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const lit = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) {
      lit.setValue(focused ? 1 : 0);
      return;
    }
    Animated.timing(lit, { toValue: focused ? 1 : 0, duration: 160, useNativeDriver: true }).start();
    if (focused) {
      scale.setValue(0.86);
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, stiffness: 420, damping: 14, mass: 0.7 }).start();
    }
  }, [focused, reduceMotion, lit, scale]);
  const idle = lit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={badge ? `${label}, ${badge} to review` : label}
      onPressIn={() => {
        if (reduceMotion) return;
        Animated.spring(scale, { toValue: 0.86, useNativeDriver: true, stiffness: 600, damping: 24 }).start();
      }}
      onPressOut={() => {
        if (reduceMotion) return;
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, stiffness: 500, damping: 16 }).start();
      }}
      onPress={() => {
        if (!focused) tapSelect();
        onPress();
      }}
      style={{ flex: 1, height: 52, alignItems: "center", justifyContent: "center" }}
    >
      <Animated.View style={{ width: 26, height: 26, transform: [{ scale }] }}>
        <Animated.View style={{ position: "absolute", opacity: idle }}>
          <Icon name={icon} size={26} color={palette.tertiary} />
        </Animated.View>
        <Animated.View style={{ opacity: lit }}>
          <Icon name={icon} size={26} color={palette.ink} filled />
        </Animated.View>
        {badge ? (
          <View style={[badgeStyle, { backgroundColor: palette.warn, borderColor: palette.bg }]}>
            <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{badge > 99 ? "99+" : badge}</Text>
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

function LogButton({ onPress }: { onPress: () => void }) {
  const { palette } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReduceMotion();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Log a purchase"
      onPressIn={() => {
        if (reduceMotion) return;
        Animated.spring(scale, { toValue: 0.88, useNativeDriver: true, stiffness: 600, damping: 22 }).start();
      }}
      onPressOut={() => {
        if (reduceMotion) return;
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, stiffness: 380, damping: 12 }).start();
      }}
      onPress={() => {
        tapPress();
        onPress();
      }}
      style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
    >
      <Animated.View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: palette.ink,
          alignItems: "center",
          justifyContent: "center",
          transform: [{ scale }],
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: palette.scheme === "dark" ? 0.5 : 0.2,
          shadowRadius: 16,
          elevation: 8,
        }}
      >
        <Icon name="plus" size={26} color={palette.bg} />
      </Animated.View>
    </Pressable>
  );
}

/** Four icons with the log button in the middle: Home, Activity, +, Insights, Settings. */
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
  const isDark = palette.scheme === "dark";
  const activeName = state.routes[state.index]?.name ?? "index";
  const routeFor = (name: string) => state.routes.find((route) => route.name === name);
  const tab = (spec: (typeof TABS)[number]) => {
    const route = routeFor(spec.name);
    if (!route) return <View key={spec.name} style={{ flex: 1 }} />;
    const focused = activeName === spec.name;
    return (
      <TabIcon
        key={spec.name}
        icon={spec.icon}
        label={spec.title}
        focused={focused}
        badge={spec.name === "activity" && reviewCount > 0 ? reviewCount : undefined}
        onPress={() => onPress(route, focused)}
      />
    );
  };
  return (
    <View
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        paddingTop: 6,
        paddingBottom: Math.max(insets.bottom - 4, 10),
        paddingHorizontal: 10,
        backgroundColor: reduceTransparency ? palette.bg : palette.navBg,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: palette.line,
        overflow: "visible",
      }}
    >
      {!reduceTransparency ? (
        <BlurView intensity={isDark ? 60 : 80} tint={palette.blurTint} style={StyleSheet.absoluteFill} />
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {tab(TABS[0])}
        {tab(TABS[1])}
        <LogButton onPress={onQuickLog} />
        {tab(TABS[2])}
        <TabIcon
          icon="gear"
          label="Settings"
          focused={false}
          onPress={() => router.push("/settings")}
        />
      </View>
    </View>
  );
}

const barButton = { width: 36, height: 36, borderRadius: 18, alignItems: "center" as const, justifyContent: "center" as const };
const unreadDot = { position: "absolute" as const, right: 6, top: 6, width: 9, height: 9, borderRadius: 4.5, borderWidth: 1.5 };
const badgeStyle = {
  position: "absolute" as const,
  top: -5,
  right: -11,
  minWidth: 18,
  height: 18,
  borderRadius: 9,
  borderWidth: 2,
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

  const onBudget = path.includes("trends");
  const onActivity = path.includes("activity");
  const onAccounts = path.startsWith("/account/");
  const onToday = !onBudget && !onActivity && !onAccounts;
  useEffect(() => {
    if (onToday) setFlightSurface("today");
    else if (onBudget) setFlightSurface("other");
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
            title: "Home",
            headerShown: showBar && onToday,
            headerTransparent: true,
            header: () => <MobileBar title="" search unread={unread} syncLabel={syncLabel} />,
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
        <Tabs.Screen
          name="trends"
          options={{
            title: "Insights",
            headerShown: showBar && path.includes("trends"),
            headerTransparent: true,
            header: () => <MobileBar title="Insights" unread={unread} syncLabel={syncLabel} />,
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
