import { Fraunces_600SemiBold } from "@expo-google-fonts/fraunces/600SemiBold";
import { Outfit_400Regular } from "@expo-google-fonts/outfit/400Regular";
import { Outfit_500Medium } from "@expo-google-fonts/outfit/500Medium";
import { Outfit_600SemiBold } from "@expo-google-fonts/outfit/600SemiBold";
import { Outfit_700Bold } from "@expo-google-fonts/outfit/700Bold";
import { useFonts } from "expo-font";
import { Platform, StyleSheet } from "react-native";

const REGULAR = "Outfit_400Regular";
const MEDIUM = "Outfit_500Medium";
const SEMIBOLD = "Outfit_600SemiBold";
const BOLD = "Outfit_700Bold";
const WORDMARK = "Fraunces_600SemiBold";

/** Maps a text style to the Outfit file that matches its weight. Custom fonts ignore numeric fontWeight. */
export function shelfFont(style: unknown): string {
  const flat = StyleSheet.flatten(style) as { fontWeight?: string | number; fontFamily?: string } | undefined;
  if (flat?.fontFamily === WORDMARK) return WORDMARK;
  const weight = String(flat?.fontWeight ?? "400");
  if (weight === "700" || weight === "800" || weight === "900" || weight === "bold") return BOLD;
  if (weight === "600" || weight === "650" || weight === "640") return SEMIBOLD;
  if (weight === "500" || weight === "550") return MEDIUM;
  return REGULAR;
}

export function useShelfType(): boolean {
  const [loaded] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Fraunces_600SemiBold,
  });
  if (loaded) {
    (globalThis as { __shelfFont?: typeof shelfFont }).__shelfFont = shelfFont;
  }
  return loaded;
}

export function useWordmark(): string {
  const loaded = useShelfType();
  if (loaded) return WORDMARK;
  return Platform.OS === "ios" ? "Georgia" : "serif";
}
