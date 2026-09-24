import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { tapSuccess } from "./haptic";
import { colors } from "./theme";

type Listener = (message: string) => void;
let listener: Listener | null = null;

const CHECK = 22;
const CHECK_LENGTH = 16;

/** A short confirmation that springs in, draws a check, then leaves. Haptic included. */
export function celebrate(message: string) {
  tapSuccess();
  listener?.(message);
}

function DrawnCheck() {
  const pathRef = useRef<Path>(null);
  const ring = useRef(new Animated.Value(0.72)).current;
  const ringOpacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(ring, { toValue: 1.7, duration: 560, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(ringOpacity, { toValue: 0, duration: 560, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    let frame = 0;
    const started = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - started) / 320);
      const eased = 1 - Math.pow(1 - t, 3);
      pathRef.current?.setNativeProps?.({ strokeDashoffset: CHECK_LENGTH * (1 - eased) });
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    pathRef.current?.setNativeProps?.({ strokeDashoffset: CHECK_LENGTH });
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ring, ringOpacity]);

  return (
    <View style={{ width: CHECK, height: CHECK, alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        style={{
          position: "absolute",
          width: CHECK,
          height: CHECK,
          borderRadius: CHECK / 2,
          borderWidth: 1.5,
          borderColor: "#7dffa8",
          opacity: ringOpacity,
          transform: [{ scale: ring }],
        }}
      />
      <Svg width={CHECK} height={CHECK}>
        <Circle cx={CHECK / 2} cy={CHECK / 2} r={10} fill="#3dbe9a" />
        <Path
          ref={pathRef}
          d="M6.2 11.3 L9.3 14.3 L15.8 7.6"
          stroke="#ffffff"
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={CHECK_LENGTH}
          strokeDashoffset={CHECK_LENGTH}
        />
      </Svg>
    </View>
  );
}

export function ToastHost() {
  const [message, setMessage] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.86)).current;
  const y = useRef(new Animated.Value(-8)).current;
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    listener = (next) => {
      if (hide.current) clearTimeout(hide.current);
      setMessage(next);
      setTick((value) => value + 1);
      opacity.setValue(0);
      scale.setValue(0.86);
      y.setValue(-8);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, stiffness: 420, damping: 16, mass: 0.55 }),
        Animated.spring(y, { toValue: 0, useNativeDriver: true, stiffness: 420, damping: 18, mass: 0.55 }),
      ]).start();
      hide.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
          Animated.timing(y, { toValue: -6, duration: 220, useNativeDriver: true }),
        ]).start(({ finished }) => {
          if (finished) setMessage(null);
        });
      }, 1200);
    };
    return () => {
      listener = null;
      if (hide.current) clearTimeout(hide.current);
    };
  }, [opacity, scale, y]);

  if (!message) return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 72, alignItems: "center" }}>
      <Animated.View
        style={{
          opacity,
          transform: [{ translateY: y }, { scale }],
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingLeft: 8,
          paddingRight: 16,
          minHeight: 44,
          borderRadius: 999,
          backgroundColor: colors.ink,
          shadowColor: "#000",
          shadowOpacity: 0.22,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
        }}
      >
        <DrawnCheck key={tick} />
        <Text style={{ color: colors.controlInk, fontSize: 15, fontWeight: "600", letterSpacing: -0.2 }}>{message}</Text>
      </Animated.View>
    </View>
  );
}
