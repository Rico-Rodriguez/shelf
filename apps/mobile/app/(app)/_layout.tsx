import { router, Tabs, usePathname } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, AppState, Easing, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, api, load, peek } from "../../src/api";
import { tapSelect } from "../../src/haptic";
import { useWordmark } from "../../src/brand";
import { Icon } from "../../src/icons";
import { colors } from "../../src/ui";

const TABS = [
  { name: "index", title: "Home", icon: "home" },
  { name: "activity", title: "Activity", icon: "list" },
  { name: "budget", title: "Budget", icon: "chart" },
  { name: "accounts", title: "Accounts", icon: "wallet" },
  { name: "more", title: "More", icon: "more" },
] as const;

function MobileBar({ unread, syncLabel }: { unread: number; syncLabel: string }) {
  const insets = useSafeAreaInsets();
  const wordmark = useWordmark();
  const opacity = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState("");
  useEffect(() => {
    if (!syncLabel) return;
    setShown(syncLabel);
    opacity.setValue(1);
    if (syncLabel !== "Up to date") return;
    const fade = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }, 1400);
    return () => clearTimeout(fade);
  }, [opacity, syncLabel]);
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.line }}>
      <View style={{ minHeight: 52, flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 8 }}>
        <View style={{ flex: 1 }} />
        <View style={{ alignItems: "center", justifyContent: "center", height: 36 }}>
          <Text style={{ fontFamily: wordmark, fontSize: 22, fontWeight: "600", letterSpacing: -0.6, color: colors.ink }}>Shelf</Text>
            <Animated.Text style={{ height: 14, fontSize: 11, lineHeight: 14, color: shown === "Sync failed" ? colors.danger : shown === "Up to date" ? colors.positive : colors.muted, opacity }}>
            {shown}
          </Animated.Text>
        </View>
        <View style={{ flex: 1, flexDirection: "row", justifyContent: "flex-end", alignItems: "center" }}>
          <Pressable accessibilityLabel="Search" onPress={() => router.push("/search")} style={barButton}>
            <Icon name="search" size={20} color={colors.ink} />
          </Pressable>
          <Pressable accessibilityLabel="Settings" onPress={() => router.push("/settings")} style={barButton}>
            <Icon name="gear" size={20} color={colors.ink} />
          </Pressable>
          <Pressable accessibilityLabel="Notifications" onPress={() => router.push("/notifications")} style={barButton}>
            <Icon name="bell" size={20} color={colors.ink} />
            {unread ? <View style={[unreadDot, { backgroundColor: colors.danger }]} /> : null}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function ShelfTabBar({
  state,
  reviewCount,
  onPress,
}: {
  state: { index: number; routes: { key: string; name: string }[] };
  reviewCount: number;
  onPress: (route: { key: string; name: string }, focused: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const count = Math.max(state.routes.length, 1);
  const tab = width / count;
  useEffect(() => {
    Animated.spring(x, { toValue: state.index * tab, useNativeDriver: true, stiffness: 460, damping: 34, mass: 0.7 }).start();
  }, [state.index, tab, x]);
  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ flexDirection: "row", backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 8) }}
    >
      {tab > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={{ position: "absolute", top: 0, left: tab * 0.28, width: tab * 0.44, height: 3, borderRadius: 99, backgroundColor: colors.accent, transform: [{ translateX: x }] }}
        />
      ) : null}
      {state.routes.map((route, index) => {
        const spec = TABS.find((tab) => tab.name === route.name);
        const focused = state.index === index;
        const color = focused ? colors.accentInk : colors.tertiary;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            accessibilityLabel={route.name === "activity" && reviewCount > 0 ? `Activity, ${reviewCount} to categorize` : spec?.title}
            onPress={() => {
              if (!focused) tapSelect();
              onPress(route, focused);
            }}
            style={{ flex: 1, alignItems: "center", gap: 4, minHeight: 44 }}
          >
            <View>
              <Icon name={spec?.icon ?? "more"} size={24} color={color} filled={focused} />
              {route.name === "activity" && reviewCount > 0 ? (
                <View style={[badge, { backgroundColor: colors.danger }]}>
                  <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{reviewCount > 99 ? "99+" : reviewCount}</Text>
                </View>
              ) : null}
            </View>
            <Text style={{ fontSize: 10, fontWeight: focused ? "700" : "500", letterSpacing: -0.1, color }}>{spec?.title}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const barButton = { width: 40, height: 40, alignItems: "center" as const, justifyContent: "center" as const };
const unreadDot = { position: "absolute" as const, right: 10, top: 10, width: 8, height: 8, borderRadius: 4 };
const badge = {
  position: "absolute" as const,
  top: -4,
  right: -12,
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
        "/api/dashboard",
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
  }, [path]);

  return (
    <Tabs
      tabBar={(props) => (
        <ShelfTabBar
          state={props.state}
          reviewCount={reviewCount}
          onPress={(route, focused) => {
            const event = props.navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) props.navigation.navigate(route.name);
          }}
        />
      )}
      screenOptions={{
        header: () => <MobileBar unread={unread} syncLabel={syncLabel} />,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="activity" options={{ title: "Activity" }} />
      <Tabs.Screen name="budget" options={{ title: "Budget" }} />
      <Tabs.Screen name="accounts" options={{ title: "Accounts" }} />
      <Tabs.Screen name="more" options={{ title: "More" }} />
    </Tabs>
  );
}
