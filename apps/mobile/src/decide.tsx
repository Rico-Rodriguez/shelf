import { ReactNode, useEffect } from "react";
import { Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useScrollLock } from "./scroll";
import { colors } from "./theme";

const FLY = 420;

/** A card you can look at, then flick right to accept or left to hide. */
export function DecideCard({
  id,
  children,
  onAccept,
  onHide,
}: {
  id: string;
  children: ReactNode;
  onAccept: () => void;
  onHide: () => void;
}) {
  const x = useSharedValue(0);
  const setScrollLocked = useScrollLock();

  useEffect(() => {
    x.value = 0;
  }, [id, x]);

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .onStart(() => {
      runOnJS(setScrollLocked)(true);
    })
    .onUpdate((event) => {
      x.value = event.translationX;
    })
    .onEnd((event) => {
      if (event.translationX > 110) {
        x.value = withTiming(FLY, { duration: 180 }, (finished) => {
          if (finished) runOnJS(onAccept)();
        });
        return;
      }
      if (event.translationX < -110) {
        x.value = withTiming(-FLY, { duration: 180 }, (finished) => {
          if (finished) runOnJS(onHide)();
        });
        return;
      }
      x.value = withSpring(0, { stiffness: 420, damping: 28 });
    })
    .onFinalize(() => {
      runOnJS(setScrollLocked)(false);
    });

  const card = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { rotate: `${x.value / 28}deg` }],
  }));
  const accept = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, x.value / 90)) }));
  const hide = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, -x.value / 90)) }));

  return (
    <View style={{ minHeight: 220 }}>
      <GestureDetector gesture={pan}>
        <Animated.View style={card}>
          <View style={{ borderRadius: 22, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, overflow: "hidden", minHeight: 180 }}>
            <Animated.View
              pointerEvents="none"
              style={[
                { position: "absolute", top: 16, left: 16, zIndex: 2, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 2, borderColor: colors.positive },
                accept,
              ]}
            >
              <Text style={{ color: colors.positive, fontWeight: "700", letterSpacing: 1 }}>ACCEPT</Text>
            </Animated.View>
            <Animated.View
              pointerEvents="none"
              style={[
                { position: "absolute", top: 16, right: 16, zIndex: 2, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 2, borderColor: colors.danger },
                hide,
              ]}
            >
              <Text style={{ color: colors.danger, fontWeight: "700", letterSpacing: 1 }}>HIDE</Text>
            </Animated.View>
            {children}
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
