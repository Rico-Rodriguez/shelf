import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { tapSuccess } from "./haptic";
import { colors } from "./theme";

type Listener = (message: string) => void;
let listener: Listener | null = null;

const CHECK = 22;
const CHECK_LENGTH = 16;
const SPARKS = [0, 45, 90, 135, 180, 225, 270, 315];

/** A short confirmation that springs in, draws a check, then leaves. Haptic included. */
export function celebrate(message: string) {
  tapSuccess();
  listener?.(message);
}

/** The same check, large enough to be the whole moment — used when a queue clears. */
export function SuccessMark({ size = 72 }: { size?: number }) {
  return <DrawnCheck size={size} />;
}

function DrawnCheck({ size = CHECK }: { size?: number }) {
  const pathRef = useRef<Path>(null);
  const pop = useRef(new Animated.Value(0.4)).current;
  const ring = useRef(new Animated.Value(0.7)).current;
  const ringOpacity = useRef(new Animated.Value(0.7)).current;
  const spark = useRef(new Animated.Value(0)).current;
  const length = CHECK_LENGTH * (size / CHECK);

  useEffect(() => {
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, stiffness: 420, damping: 14, mass: 0.55 }).start();
    Animated.parallel([
      Animated.timing(ring, { toValue: 1.85, duration: 640, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(ringOpacity, { toValue: 0, duration: 640, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(spark, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    let frame = 0;
    const started = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - started) / 340);
      const eased = 1 - Math.pow(1 - t, 3);
      pathRef.current?.setNativeProps?.({ strokeDashoffset: length * (1 - eased) });
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    pathRef.current?.setNativeProps?.({ strokeDashoffset: length });
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [length, pop, ring, ringOpacity, spark]);

  const reach = size * 0.72;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {SPARKS.map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const translateX = spark.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(rad) * reach] });
        const translateY = spark.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(rad) * reach] });
        return (
          <Animated.View
            key={deg}
            style={{
              position: "absolute",
              width: Math.max(4, size * 0.08),
              height: Math.max(4, size * 0.08),
              borderRadius: 99,
              backgroundColor: deg % 90 === 0 ? "#7dffa8" : "#3dbe9a",
              opacity: spark.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }),
              transform: [{ translateX }, { translateY }, { scale: spark.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
            }}
          />
        );
      })}
      <Animated.View
        style={{
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1.5,
          borderColor: "#7dffa8",
          opacity: ringOpacity,
          transform: [{ scale: ring }],
        }}
      />
      <Animated.View style={{ transform: [{ scale: pop }] }}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={size * 0.45} fill="#3dbe9a" />
          <Path
            ref={pathRef}
            d={`M${size * 0.28} ${size * 0.51} L${size * 0.42} ${size * 0.65} L${size * 0.72} ${size * 0.34}`}
            stroke="#ffffff"
            strokeWidth={Math.max(2, size * 0.09)}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={length}
            strokeDashoffset={length}
          />
        </Svg>
      </Animated.View>
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
        <DrawnCheck key={tick} size={CHECK} />
        <Text style={{ color: colors.controlInk, fontSize: 15, fontWeight: "600", letterSpacing: -0.2 }}>{message}</Text>
      </Animated.View>
    </View>
  );
}
