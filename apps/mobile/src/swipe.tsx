import { ReactNode, useRef } from "react";
import { Animated, PanResponder, Pressable, Text, View } from "react-native";
import { colors } from "./ui";

const BUTTON = 76;

export type SwipeAction = {
  label: string;
  tone: "ink" | "danger" | "accent";
  onPress: () => void;
};

export function SwipeRow({
  children,
  actions,
  peek = false,
  divided = false,
  onPress,
}: {
  children: ReactNode;
  actions: SwipeAction[];
  peek?: boolean;
  divided?: boolean;
  onPress?: () => void;
}) {
  const toneStyle = {
    ink: { backgroundColor: colors.ink, color: colors.controlInk },
    danger: { backgroundColor: colors.danger, color: "#fff" },
    accent: { backgroundColor: colors.accent, color: colors.controlInk },
  };
  const width = Math.max(BUTTON, actions.length * BUTTON);
  const x = useRef(new Animated.Value(0)).current;
  const offset = useRef(0);
  const start = useRef(0);

  function settle(next: number) {
    offset.current = next;
    Animated.spring(x, { toValue: next, useNativeDriver: true, stiffness: 520, damping: 36, mass: 1 }).start();
  }

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        start.current = offset.current;
      },
      onPanResponderMove: (_, gesture) => {
        const raw = start.current + gesture.dx;
        const next = raw > 0 ? raw * 0.22 : raw < -width ? -width + (raw + width) * 0.22 : raw;
        offset.current = next;
        x.setValue(next);
      },
      onPanResponderRelease: () => {
        settle(offset.current < -width / 2 ? -width : 0);
      },
      onPanResponderTerminate: () => {
        settle(offset.current < -width / 2 ? -width : 0);
      },
    }),
  ).current;

  return (
    <View style={{ overflow: "hidden", borderTopWidth: divided ? 1 : 0, borderTopColor: colors.line }}>
      <View style={{ position: "absolute", right: 0, top: 0, bottom: 0, width, flexDirection: "row" }}>
        {actions.map((action) => (
          <Pressable
            key={action.label}
            onPress={() => {
              settle(0);
              action.onPress();
            }}
            style={{ width: width / actions.length, alignItems: "center", justifyContent: "center", backgroundColor: toneStyle[action.tone].backgroundColor }}
          >
            <Text style={{ color: toneStyle[action.tone].color, fontSize: 13, fontWeight: "600" }}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
      <Animated.View style={{ transform: [{ translateX: x }], backgroundColor: colors.card }} {...pan.panHandlers}>
        <Pressable
          onPress={() => {
            if (offset.current !== 0) {
              settle(0);
              return;
            }
            onPress?.();
          }}
        >
          {children}
          {peek ? (
            <View pointerEvents="none" style={{ position: "absolute", right: 0, top: 10, bottom: 10, width: 3, borderRadius: 99, backgroundColor: colors.accent }} />
          ) : null}
        </Pressable>
      </Animated.View>
    </View>
  );
}
