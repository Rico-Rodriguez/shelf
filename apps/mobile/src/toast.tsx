import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Text, View } from "react-native";
import { tapSuccess } from "./haptic";
import { colors } from "./theme";

type Listener = (message: string) => void;
let listener: Listener | null = null;

/** A short confirmation that springs in, then leaves. Haptic included. */
export function celebrate(message: string) {
  tapSuccess();
  listener?.(message);
}

export function ToastHost() {
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    listener = (next) => {
      if (hide.current) clearTimeout(hide.current);
      setMessage(next);
      opacity.setValue(0);
      scale.setValue(0.92);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, stiffness: 460, damping: 18, mass: 0.6 }),
      ]).start();
      hide.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(({ finished }) => {
          if (finished) setMessage(null);
        });
      }, 1100);
    };
    return () => {
      listener = null;
      if (hide.current) clearTimeout(hide.current);
    };
  }, [opacity, scale]);

  if (!message) return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 72, alignItems: "center" }}>
      <Animated.View
        style={{
          opacity,
          transform: [{ scale }],
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 14,
          minHeight: 40,
          borderRadius: 999,
          backgroundColor: colors.ink,
        }}
      >
        <Text style={{ color: colors.positive, fontSize: 16, fontWeight: "700" }}>✓</Text>
        <Text style={{ color: colors.controlInk, fontSize: 15, fontWeight: "600", letterSpacing: -0.2 }}>{message}</Text>
      </Animated.View>
    </View>
  );
}
