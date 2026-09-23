import { Fraunces_600SemiBold, useFonts } from "@expo-google-fonts/fraunces";
import { Platform } from "react-native";

export function useWordmark(): string {
  const [loaded] = useFonts({ Fraunces_600SemiBold });
  if (loaded) return "Fraunces_600SemiBold";
  return Platform.OS === "ios" ? "Georgia" : "serif";
}
