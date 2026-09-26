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
  bg: "#f2f4f7",
  card: "#ffffff",
  cardInset: "#f0f3f6",
  fill: "#e8ecf1",
  fillStrong: "#d5dbe4",
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
  // Apple HIG Vibrancy & System Layers
  label: "#14181f",
  secondaryLabel: "#5c6570",
  tertiaryLabel: "#8b939e",
  quaternaryLabel: "#b4bac3",
  systemBackground: "#f2f4f7",
  secondarySystemBackground: "#ffffff",
  systemGroupedBackground: "#f2f4f7",
  secondarySystemGroupedBackground: "#ffffff",
  separator: "rgba(20, 24, 31, 0.08)",
  // Functional Liquid Glass Chrome
  glass: "rgba(255, 255, 255, 0.72)",
  glassProminent: "rgba(255, 255, 255, 0.88)",
  glassBorder: "rgba(255, 255, 255, 0.95)",
  glassBorderSubtle: "rgba(20, 24, 31, 0.08)",
  glassUltraThin: "rgba(255, 255, 255, 0.50)",
  glassRegular: "rgba(255, 255, 255, 0.76)",
  dockBg: "rgba(255, 255, 255, 0.82)",
  specularTop: "rgba(255, 255, 255, 0.96)",
  specularSides: "rgba(20, 24, 31, 0.08)",
  specularBottom: "rgba(20, 24, 31, 0.05)",
  navBg: "rgba(242, 244, 247, 0.76)",
  sheetBg: "rgba(255, 255, 255, 0.95)",
  blurTint: "systemChromeMaterialLight",
  blurSubtleTint: "systemMaterialLight",
};

export const dark: Palette = {
  bg: "#0c0e12",
  card: "#171a22",
  cardInset: "#12151b",
  fill: "#242933",
  fillStrong: "#323946",
  ink: "#f4f1ea",
  accentInk: "#b7f3df",
  muted: "#a3abb8",
  tertiary: "#717987",
  line: "rgba(244, 241, 234, 0.09)",
  lineStrong: "rgba(244, 241, 234, 0.16)",
  positive: "#3dbe9a",
  danger: "#ff6b4a",
  accent: "#3dbe9a",
  accentSoft: "rgba(61, 190, 154, 0.16)",
  warn: "#e0a15a",
  control: "#f4f1ea",
  controlInk: "#101216",
  scheme: "dark",
  // Apple HIG Vibrancy & System Layers
  label: "#f4f1ea",
  secondaryLabel: "#a3abb8",
  tertiaryLabel: "#717987",
  quaternaryLabel: "#4a5260",
  systemBackground: "#0c0e12",
  secondarySystemBackground: "#171a22",
  systemGroupedBackground: "#0c0e12",
  secondarySystemGroupedBackground: "#171a22",
  separator: "rgba(244, 241, 234, 0.09)",
  // Functional Liquid Glass Chrome
  glass: "rgba(22, 26, 34, 0.70)",
  glassProminent: "rgba(28, 34, 44, 0.84)",
  glassBorder: "rgba(255, 255, 255, 0.18)",
  glassBorderSubtle: "rgba(255, 255, 255, 0.07)",
  glassUltraThin: "rgba(22, 26, 34, 0.48)",
  glassRegular: "rgba(22, 26, 34, 0.72)",
  dockBg: "rgba(23, 27, 35, 0.80)",
  specularTop: "rgba(255, 255, 255, 0.22)",
  specularSides: "rgba(255, 255, 255, 0.08)",
  specularBottom: "rgba(0, 0, 0, 0.32)",
  navBg: "rgba(12, 14, 18, 0.75)",
  sheetBg: "rgba(23, 27, 35, 0.94)",
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
