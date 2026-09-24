import { Fraunces_600SemiBold } from "@expo-google-fonts/fraunces/600SemiBold";
import { useFonts } from "expo-font";
import { Platform } from "react-native";

export function useWordmark(): string {
  const [loaded] = useFonts({ Fraunces_600SemiBold });
  if (loaded) return "Fraunces_600SemiBold";
  return Platform.OS === "ios" ? "Georgia" : "serif";
}
