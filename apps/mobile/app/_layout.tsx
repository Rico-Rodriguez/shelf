import { Stack } from "expo-router";
import * as Updates from "expo-updates";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider } from "../src/session";

function useOverTheAirUpdate() {
  useEffect(() => {
    if (__DEV__) return;
    void (async () => {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (!result.isAvailable) return;
        await Updates.fetchUpdateAsync();
        await Updates.reloadAsync();
      } catch {
        // Keep the installed copy when the update server is unreachable.
      }
    })();
  }, []);
}

export default function RootLayout() {
  useOverTheAirUpdate();
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#f3f5f7" } }} />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
