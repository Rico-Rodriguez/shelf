import { Tabs } from "expo-router";

export default function AppTabs() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: "#1c1f24", tabBarInactiveTintColor: "#5c6570" }}>
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="activity" options={{ title: "Activity" }} />
      <Tabs.Screen name="budget" options={{ title: "Budget" }} />
      <Tabs.Screen name="accounts" options={{ title: "Accounts" }} />
      <Tabs.Screen name="more" options={{ title: "More" }} />
    </Tabs>
  );
}
