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
  bg: "#ffffff",
  card: "#f4f5f7",
  cardInset: "#eceef1",
  fill: "#eceef1",
  fillStrong: "#dcdfe3",
  ink: "#0b0b0c",
  accentInk: "#0a7f45",
  muted: "#6b6f76",
  tertiary: "#9a9ea5",
  line: "rgba(60, 60, 67, 0.1)",
  lineStrong: "rgba(60, 60, 67, 0.2)",
  positive: "#0a8f4e",
  danger: "#e0412b",
  accent: "#0a8f4e",
  accentSoft: "rgba(10, 143, 78, 0.11)",
  warn: "#e0662a",
  control: "#0b0b0f",
  controlInk: "#ffffff",
  scheme: "light",
  // Apple HIG Vibrancy & System Layers
  label: "#0b0b0f",
  secondaryLabel: "#6c6c73",
  tertiaryLabel: "#9b9ba2",
  quaternaryLabel: "#c4c4c9",
  systemBackground: "#ffffff",
  secondarySystemBackground: "#f4f5f7",
  systemGroupedBackground: "#ffffff",
  secondarySystemGroupedBackground: "#f4f5f7",
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
  navBg: "rgba(255, 255, 255, 0.84)",
  sheetBg: "rgba(255, 255, 255, 0.97)",
  blurTint: "systemChromeMaterialLight",
  blurSubtleTint: "systemMaterialLight",
};

export const dark: Palette = {
  bg: "#000000",
  card: "#141416",
  cardInset: "#0c0c0d",
  fill: "#1f1f22",
  fillStrong: "#2e2e32",
  ink: "#f5f5f7",
  accentInk: "#2fd07f",
  muted: "#98989f",
  tertiary: "#6c6c72",
  line: "rgba(235, 235, 245, 0.09)",
  lineStrong: "rgba(235, 235, 245, 0.16)",
  positive: "#2fd07f",
  danger: "#ff6a55",
  accent: "#2fd07f",
  accentSoft: "rgba(47, 208, 127, 0.14)",
  warn: "#ff8a4c",
  control: "#f5f5f7",
  controlInk: "#0b0b0f",
  scheme: "dark",
  // Apple HIG Vibrancy & System Layers
  label: "#f5f5f7",
  secondaryLabel: "#a1a1a8",
  tertiaryLabel: "#6e6e76",
  quaternaryLabel: "#48484d",
  systemBackground: "#000000",
  secondarySystemBackground: "#141416",
  systemGroupedBackground: "#000000",
  secondarySystemGroupedBackground: "#141416",
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
    void AccessibilityInfo.isReduceTransparencyEnabled?.()
      .then(setReduceTransparency)
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener("reduceTransparencyChanged", (enabled) => {
      setReduceTransparency(enabled);
    });
    return () => sub.remove();
  }, []);

  return reduceTransparency;
}

export type MotionMode = "expressive" | "calm";

const MOTION_KEY = "shelf-motion";
let motionMode: MotionMode = "expressive";
const motionListeners = new Set<(mode: MotionMode) => void>();
void SecureStore.getItemAsync(MOTION_KEY)
  .then((stored) => {
    if (stored === "calm" || stored === "expressive") setMotionMode(stored, false);
  })
  .catch(() => undefined);

export function setMotionMode(next: MotionMode, persist = true) {
  motionMode = next;
  if (persist) void SecureStore.setItemAsync(MOTION_KEY, next).catch(() => undefined);
  motionListeners.forEach((listener) => listener(next));
}

/** Expressive (rolling numbers, charts that draw in, springy sheets) or calm (plain fades). */
export function useMotionMode(): MotionMode {
  const [mode, setMode] = useState(motionMode);
  useEffect(() => {
    setMode(motionMode);
    motionListeners.add(setMode);
    return () => {
      motionListeners.delete(setMode);
    };
  }, []);
  return mode;
}

/**
 * Motion finishes on the first frame when the iPhone's Reduce Motion is on,
 * or when the person turned expressive motion off in Settings. Haptics stay.
 */
export function useReduceMotion(): boolean {
  const [systemReduce, setSystemReduce] = useState(false);
  const mode = useMotionMode();

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setSystemReduce)
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      setSystemReduce(enabled);
    });
    return () => sub.remove();
  }, []);

  return systemReduce || mode === "calm";
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
