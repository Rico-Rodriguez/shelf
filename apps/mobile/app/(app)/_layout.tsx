import { Tabs } from "expo-router";
import type { ColorValue } from "react-native";
import { Icon } from "../../src/icons";

function tabIcon(name: string) {
  return ({ color, focused }: { color: ColorValue; focused: boolean; size: number }) => (
    <Icon name={name} color={typeof color === "string" ? color : "#1c1f24"} filled={focused} size={24} />
  );
}

export default function AppTabs() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: "#1c1f24", tabBarInactiveTintColor: "#5c6570" }}>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: tabIcon("home") }} />
      <Tabs.Screen name="activity" options={{ title: "Activity", tabBarIcon: tabIcon("list") }} />
      <Tabs.Screen name="budget" options={{ title: "Budget", tabBarIcon: tabIcon("chart") }} />
      <Tabs.Screen name="accounts" options={{ title: "Accounts", tabBarIcon: tabIcon("wallet") }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: tabIcon("more") }} />
    </Tabs>
  );
}
