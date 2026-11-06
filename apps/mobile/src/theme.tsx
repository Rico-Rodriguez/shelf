import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AccessibilityInfo, Appearance } from "react-native";
import * as SecureStore from "expo-secure-store";

export type Palette = {
  bg: string;
  card: string;
  cardInset: string;
  fill: string;
  fillStrong: string;
  ink: string;
  accentInk: string;
  muted: string;
  tertiary: string;
  line: string;
  lineStrong: string;
  positive: string;
  danger: string;
  accent: string;
  accentSoft: string;
  warn: string;
  control: string;
  controlInk: string;
  scheme: "light" | "dark";
  // Apple HIG System Materials & Vibrancy
  label: string;
  secondaryLabel: string;
  tertiaryLabel: string;
  quaternaryLabel: string;
  systemBackground: string;
  secondarySystemBackground: string;
  systemGroupedBackground: string;
  secondarySystemGroupedBackground: string;
  separator: string;
  // Liquid Glass & HIG functional layer tokens
  glass: string;
  glassProminent: string;
  glassBorder: string;
  glassBorderSubtle: string;
  glassUltraThin: string;
  glassRegular: string;
  dockBg: string;
  specularTop: string;
  specularSides: string;
  specularBottom: string;
  navBg: string;
  sheetBg: string;
  blurTint: "light" | "dark" | "systemMaterial" | "systemMaterialLight" | "systemMaterialDark" | "systemChromeMaterialLight" | "systemChromeMaterialDark";
  blurSubtleTint: "light" | "dark" | "systemMaterial" | "systemMaterialLight" | "systemMaterialDark" | "systemThinMaterialLight" | "systemThinMaterialDark";
};

export const light: Palette = {
  bg: "#f2f2f7",
  card: "#ffffff",
  cardInset: "#f2f2f7",
  fill: "#ebebf0",
  fillStrong: "#d8d8de",
  ink: "#0b0b0f",
  accentInk: "#0d6b52",
  muted: "#6c6c73",
  tertiary: "#9b9ba2",
  line: "rgba(60, 60, 67, 0.12)",
  lineStrong: "rgba(60, 60, 67, 0.22)",
  positive: "#0f8a66",
  danger: "#e0412b",
  accent: "#0f8a66",
  accentSoft: "rgba(15, 138, 102, 0.11)",
  warn: "#c2770f",
  control: "#0b0b0f",
  controlInk: "#ffffff",
  scheme: "light",
  // Apple HIG Vibrancy & System Layers
  label: "#0b0b0f",
  secondaryLabel: "#6c6c73",
  tertiaryLabel: "#9b9ba2",
  quaternaryLabel: "#c4c4c9",
  systemBackground: "#f2f2f7",
  secondarySystemBackground: "#ffffff",
  systemGroupedBackground: "#f2f2f7",
  secondarySystemGroupedBackground: "#ffffff",
  separator: "rgba(60, 60, 67, 0.12)",
  // Functional Liquid Glass Chrome
  glass: "rgba(255, 255, 255, 0.72)",
  glassProminent: "rgba(255, 255, 255, 0.9)",
  glassBorder: "rgba(255, 255, 255, 0.95)",
  glassBorderSubtle: "rgba(60, 60, 67, 0.1)",
  glassUltraThin: "rgba(255, 255, 255, 0.50)",
  glassRegular: "rgba(255, 255, 255, 0.78)",
  dockBg: "rgba(255, 255, 255, 0.86)",
  specularTop: "rgba(255, 255, 255, 0.96)",
  specularSides: "rgba(60, 60, 67, 0.08)",
  specularBottom: "rgba(60, 60, 67, 0.08)",
  navBg: "rgba(242, 242, 247, 0.82)",
  sheetBg: "rgba(255, 255, 255, 0.97)",
  blurTint: "systemChromeMaterialLight",
  blurSubtleTint: "systemMaterialLight",
};

export const dark: Palette = {
  bg: "#000000",
  card: "#1c1c1e",
  cardInset: "#141416",
  fill: "#2c2c2e",
  fillStrong: "#3a3a3c",
  ink: "#f5f5f7",
  accentInk: "#5ee0b4",
  muted: "#a1a1a8",
  tertiary: "#6e6e76",
  line: "rgba(235, 235, 245, 0.1)",
  lineStrong: "rgba(235, 235, 245, 0.18)",
  positive: "#3fd29f",
  danger: "#ff6a55",
  accent: "#3fd29f",
  accentSoft: "rgba(63, 210, 159, 0.15)",
  warn: "#f0a94a",
  control: "#f5f5f7",
  controlInk: "#0b0b0f",
  scheme: "dark",
  // Apple HIG Vibrancy & System Layers
  label: "#f5f5f7",
  secondaryLabel: "#a1a1a8",
  tertiaryLabel: "#6e6e76",
  quaternaryLabel: "#48484d",
  systemBackground: "#000000",
  secondarySystemBackground: "#1c1c1e",
  systemGroupedBackground: "#000000",
  secondarySystemGroupedBackground: "#1c1c1e",
  separator: "rgba(235, 235, 245, 0.1)",
  // Functional Liquid Glass Chrome
  glass: "rgba(28, 28, 30, 0.72)",
  glassProminent: "rgba(36, 36, 38, 0.88)",
  glassBorder: "rgba(255, 255, 255, 0.14)",
  glassBorderSubtle: "rgba(255, 255, 255, 0.07)",
  glassUltraThin: "rgba(28, 28, 30, 0.48)",
  glassRegular: "rgba(28, 28, 30, 0.74)",
  dockBg: "rgba(30, 30, 32, 0.84)",
  specularTop: "rgba(255, 255, 255, 0.16)",
  specularSides: "rgba(255, 255, 255, 0.07)",
  specularBottom: "rgba(0, 0, 0, 0.4)",
  navBg: "rgba(0, 0, 0, 0.78)",
  sheetBg: "rgba(28, 28, 30, 0.97)",
  blurTint: "systemChromeMaterialDark",
  blurSubtleTint: "systemMaterialDark",
};

export type ThemeMode = "system" | "light" | "dark";

const KEY = "shelf-theme";

/** Live palette. Call sites read it during render; ThemeProvider updates it before re-rendering. */
export const colors: Palette = { ...light };

/** Hook to automatically disable blur/materials when Reduce Transparency is enabled in iOS Accessibility. */
export function useReduceTransparency(): boolean {
  const [reduceTransparency, setReduceTransparency] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then(setReduceTransparency)
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener("reduceTransparencyChanged", (enabled) => {
      setReduceTransparency(enabled);
    });
    return () => sub.remove();
  }, []);

  return reduceTransparency;
}

/** Motion finishes on the first frame when Reduce Motion is on. Haptics stay. */
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      setReduceMotion(enabled);
    });
    return () => sub.remove();
  }, []);

  return reduceMotion;
}

type ThemeValue = {
  mode: ThemeMode;
  palette: Palette;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeValue>({
  mode: "system",
  palette: light,
  setMode: () => undefined,
});

function resolve(mode: ThemeMode, system: string | null | undefined): Palette {
  const scheme = mode === "system" ? (system === "dark" ? "dark" : "light") : mode;
  return scheme === "dark" ? dark : light;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [system, setSystem] = useState(Appearance.getColorScheme());
  const palette = useMemo(() => resolve(mode, system), [mode, system]);
  Object.assign(colors, palette);

  useEffect(() => {
    void SecureStore.getItemAsync(KEY)
      .then((stored) => {
        if (stored === "light" || stored === "dark" || stored === "system") setModeState(stored);
      })
      .catch(() => undefined);
    const sub = Appearance.addChangeListener(({ colorScheme }) => setSystem(colorScheme));
    return () => sub.remove();
  }, []);

  function setMode(next: ThemeMode) {
    setModeState(next);
    void SecureStore.setItemAsync(KEY, next);
  }

  const value = useMemo(() => ({ mode, palette, setMode }), [mode, palette]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

/**
 * Styles that read the palette. A module-level StyleSheet.create copies the light
 * colors once at import, so dark mode never reaches it. This returns a hook that
 * builds the sheet per palette and caches it.
 */
export function themedStyles<T>(make: (colors: Palette) => T): () => T {
  const cache = new WeakMap<Palette, T>();
  return function useThemedStyles() {
    const { palette } = useTheme();
    let sheet = cache.get(palette);
    if (!sheet) {
      sheet = make(palette);
      cache.set(palette, sheet);
    }
    return sheet;
  };
}
