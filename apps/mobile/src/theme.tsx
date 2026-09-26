import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AccessibilityInfo, Appearance } from "react-native";
import * as SecureStore from "expo-secure-store";

export type Palette = {
  bg: string;
  card: string;
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
  // Liquid Glass & HIG material tokens
  glass: string;
  glassProminent: string;
  glassBorder: string;
  glassBorderSubtle: string;
  glassUltraThin: string;
  glassRegular: string;
  specularTop: string;
  specularSides: string;
  specularBottom: string;
  navBg: string;
  sheetBg: string;
  blurTint: "light" | "dark" | "systemMaterial" | "systemMaterialLight" | "systemMaterialDark" | "systemChromeMaterialLight" | "systemChromeMaterialDark";
  blurSubtleTint: "light" | "dark" | "systemMaterial" | "systemMaterialLight" | "systemMaterialDark" | "systemThinMaterialLight" | "systemThinMaterialDark";
};

export const light: Palette = {
  bg: "#f3f5f7",
  card: "#ffffff",
  fill: "#e8ecf0",
  fillStrong: "#d5dbe3",
  ink: "#14181f",
  accentInk: "#0f5241",
  muted: "#5c6570",
  tertiary: "#8b939e",
  line: "rgba(20, 24, 31, 0.08)",
  lineStrong: "rgba(20, 24, 31, 0.14)",
  positive: "#1b7a62",
  danger: "#d94a2e",
  accent: "#1b7a62",
  accentSoft: "rgba(27, 122, 98, 0.12)",
  warn: "#c47a1a",
  control: "#14181f",
  controlInk: "#ffffff",
  scheme: "light",
  glass: "rgba(255, 255, 255, 0.76)",
  glassProminent: "rgba(255, 255, 255, 0.88)",
  glassBorder: "rgba(255, 255, 255, 0.95)",
  glassBorderSubtle: "rgba(20, 24, 31, 0.08)",
  glassUltraThin: "rgba(255, 255, 255, 0.55)",
  glassRegular: "rgba(255, 255, 255, 0.78)",
  specularTop: "rgba(255, 255, 255, 0.96)",
  specularSides: "rgba(20, 24, 31, 0.08)",
  specularBottom: "rgba(20, 24, 31, 0.06)",
  navBg: "rgba(243, 245, 247, 0.76)",
  sheetBg: "rgba(255, 255, 255, 0.94)",
  blurTint: "systemChromeMaterialLight",
  blurSubtleTint: "systemMaterialLight",
};

export const dark: Palette = {
  bg: "#0c0e12",
  card: "#1a1e26",
  fill: "#262b34",
  fillStrong: "#343b46",
  ink: "#f4f1ea",
  accentInk: "#b7f3df",
  muted: "#b0b6c0",
  tertiary: "#8b939e",
  line: "rgba(244, 241, 234, 0.1)",
  lineStrong: "rgba(244, 241, 234, 0.18)",
  positive: "#3dbe9a",
  danger: "#ff6b4a",
  accent: "#3dbe9a",
  accentSoft: "rgba(61, 190, 154, 0.16)",
  warn: "#e0a15a",
  control: "#f4f1ea",
  controlInk: "#101216",
  scheme: "dark",
  glass: "rgba(22, 26, 34, 0.72)",
  glassProminent: "rgba(28, 34, 44, 0.84)",
  glassBorder: "rgba(255, 255, 255, 0.18)",
  glassBorderSubtle: "rgba(255, 255, 255, 0.07)",
  glassUltraThin: "rgba(22, 26, 34, 0.50)",
  glassRegular: "rgba(22, 26, 34, 0.74)",
  specularTop: "rgba(255, 255, 255, 0.24)",
  specularSides: "rgba(255, 255, 255, 0.08)",
  specularBottom: "rgba(0, 0, 0, 0.28)",
  navBg: "rgba(12, 14, 18, 0.72)",
  sheetBg: "rgba(26, 30, 38, 0.92)",
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
