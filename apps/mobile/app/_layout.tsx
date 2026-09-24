import { Stack } from "expo-router";
import * as Updates from "expo-updates";
import { useEffect } from "react";
import { AppState } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useShelfType } from "../src/brand";
import { SessionProvider } from "../src/session";
import { ThemeProvider, useTheme } from "../src/theme";
import { ToastHost } from "../src/toast";

function useOverTheAirUpdate() {
  useEffect(() => {
    if (__DEV__) return;
    let cancelled = false;

    async function applyUpdate() {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (cancelled || !result.isAvailable) return;
        const offered = "id" in result.manifest ? result.manifest.id : null;
        if (offered && offered.toLowerCase() === Updates.updateId?.toLowerCase()) return;
        await Updates.fetchUpdateAsync();
        if (!cancelled) await Updates.reloadAsync();
      } catch {
        // Keep the installed copy when the update server is unreachable.
      }
    }

    void applyUpdate();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void applyUpdate();
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);
}

function RootStack() {
  const { palette } = useTheme();
  return (
    <>
      <StatusBar style={palette.scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.bg } }} />
    </>
  );
}

export default function RootLayout() {
  useShelfType();
  useOverTheAirUpdate();
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SessionProvider>
          <RootStack />
          <ToastHost />
        </SessionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
