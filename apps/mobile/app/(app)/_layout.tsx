import { router, Tabs, usePathname } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../src/api";
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

function MobileBar({ unread }: { unread: number }) {
  const insets = useSafeAreaInsets();
  const wordmark = useWordmark();
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.line }}>
      <View style={{ minHeight: 52, flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 8 }}>
        <View style={{ flex: 1 }} />
        <Text style={{ fontFamily: wordmark, fontSize: 22, fontWeight: "600", letterSpacing: -0.6, color: colors.ink }}>
          Belf
        </Text>
        <View style={{ flex: 1, flexDirection: "row", justifyContent: "flex-end", alignItems: "center" }}>
          <Pressable accessibilityLabel="Settings" onPress={() => router.push("/settings")} style={barButton}>
            <Icon name="gear" size={20} color={colors.ink} />
          </Pressable>
          <Pressable accessibilityLabel="Notifications" onPress={() => router.push("/notifications")} style={barButton}>
            <Icon name="bell" size={20} color={colors.ink} />
            {unread ? <View style={unreadDot} /> : null}
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
  return (
    <View style={{ flexDirection: "row", backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 8) }}>
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
            onPress={() => onPress(route, focused)}
            style={{ flex: 1, alignItems: "center", gap: 4, minHeight: 44 }}
          >
            <View>
              <Icon name={spec?.icon ?? "more"} size={24} color={color} filled={focused} />
              {route.name === "activity" && reviewCount > 0 ? (
                <View style={badge}>
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
const unreadDot = { position: "absolute" as const, right: 10, top: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger };
const badge = {
  position: "absolute" as const,
  top: -4,
  right: -12,
  minWidth: 16,
  height: 16,
  borderRadius: 8,
  backgroundColor: colors.danger,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  paddingHorizontal: 4,
};

export default function AppTabs() {
  const path = usePathname();
  const [reviewCount, setReviewCount] = useState(0);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    void api<{ unreviewed: number }>("/api/transactions?countOnly=1")
      .then((res) => setReviewCount(res.unreviewed))
      .catch(() => undefined);
    void api<{ unread: number }>("/api/notifications")
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
        header: () => <MobileBar unread={unread} />,
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
