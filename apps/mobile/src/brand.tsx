import { Fraunces_600SemiBold } from "@expo-google-fonts/fraunces/600SemiBold";
import { Outfit_400Regular } from "@expo-google-fonts/outfit/400Regular";
import { Outfit_500Medium } from "@expo-google-fonts/outfit/500Medium";
import { Outfit_600SemiBold } from "@expo-google-fonts/outfit/600SemiBold";
import { Outfit_700Bold } from "@expo-google-fonts/outfit/700Bold";
import { useFonts } from "expo-font";
import { Platform, StyleSheet } from "react-native";

const WORDMARK = "Fraunces_600SemiBold";
const SYSTEM = Platform.OS === "ios" ? "System" : "sans-serif";

/** The face for a text style. Everything is SF Pro (the iPhone's own type); only the wordmark keeps Fraunces. */
export function shelfFont(style: unknown): string {
  const flat = StyleSheet.flatten(style) as { fontWeight?: string | number; fontFamily?: string } | undefined;
  if (flat?.fontFamily === WORDMARK) return WORDMARK;
  if (flat?.fontFamily) return flat.fontFamily;
  return SYSTEM;
}

// Set before the first render, so text never waits on a font file.
(globalThis as { __shelfFont?: typeof shelfFont }).__shelfFont = shelfFont;

export function useShelfType(): boolean {
  const [loaded] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Fraunces_600SemiBold,
  });
  return loaded;
}

export function useWordmark(): string {
  const loaded = useShelfType();
  if (loaded) return WORDMARK;
  return Platform.OS === "ios" ? "Georgia" : "serif";
}
