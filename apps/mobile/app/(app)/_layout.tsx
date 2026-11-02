import { router, Tabs, usePathname } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, AppState, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, api, load, peek, subscribeCache } from "../../src/api";
import { tapPress, tapSelect } from "../../src/haptic";
import { useWordmark } from "../../src/brand";
import { Icon } from "../../src/icons";
import { dashboardPath, money, netWorthCents, type NetWorthAccount } from "../../src/format";
import { subscribeOutbox } from "../../src/review-outbox";
import { useReduceTransparency, useTheme } from "../../src/theme";
import { colors, QuickLogModal, type QuickLogDraft } from "../../src/ui";

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
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: palette.ink,
                  fontVariant: ["tabular-nums"],
                  letterSpacing: -0.2,
                }}
              >
                {money(netWorth)}
              </Text>
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
  const isDark = palette.scheme === "dark";
  const color = focused ? palette.accentInk : palette.tertiary;
  const scale = useRef(new Animated.Value(1)).current;

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
        Animated.spring(scale, { toValue: 0.90, useNativeDriver: true, stiffness: 600, damping: 24 }).start();
      }}
      onPressOut={() => {
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
        backgroundColor: focused
          ? isDark
            ? "rgba(255, 255, 255, 0.12)"
            : "rgba(0, 0, 0, 0.05)"
          : "transparent",
      }}
    >
      <Animated.View style={{ position: "relative", alignItems: "center", transform: [{ scale }] }}>
        <Icon name={spec?.icon ?? "more"} size={21} color={color} filled={focused} />
        {route.name === "activity" && reviewCount > 0 ? (
          <View style={[badge, { backgroundColor: palette.danger }]}>
            <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
              {reviewCount > 99 ? "99+" : reviewCount}
            </Text>
          </View>
        ) : null}
        <Text style={{ fontSize: 11, fontWeight: focused ? "700" : "500", letterSpacing: -0.1, color, marginTop: 2 }}>
          {spec?.title}
        </Text>
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
  const isDark = palette.scheme === "dark";

  // Filter routes to primary tabs only
  const visibleRoutes = state.routes.filter((route) =>
    TABS.some((tab) => tab.name === route.name),
  );

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

        {/* Tab 1: Today */}
        {(() => {
          const route = visibleRoutes.find((r) => r.name === "index");
          if (!route) return null;
          const focused = state.routes[state.index]?.name === "index";
          const spec = TABS.find((t) => t.name === "index");
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
        })()}

        {/* Tab 2: Plan */}
        {(() => {
          const route = visibleRoutes.find((r) => r.name === "budget");
          if (!route) return null;
          const focused = state.routes[state.index]?.name === "budget";
          const spec = TABS.find((t) => t.name === "budget");
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
        })()}

        {/* Ergonomic Center Liquid Glass (+) Quick-Log Button */}
        <ShelfQuickLogButton onPress={onQuickLog} />

        {/* Tab 3: Activity (with live unreviewed counter badge) */}
        {(() => {
          const route = visibleRoutes.find((r) => r.name === "activity");
          if (!route) return null;
          const focused = state.routes[state.index]?.name === "activity";
          const spec = TABS.find((t) => t.name === "activity");
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
        })()}
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
      void api("/api/plaid/sync", { method: "POST", body: JSON.stringify({ pendingOnly }) })
        .then(() => {
          if (alive) setSyncLabel("Up to date");
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
