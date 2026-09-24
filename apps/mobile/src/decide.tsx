import { ReactNode, useEffect } from "react";
import { Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { colors } from "./theme";

const FLY = 520;

/** The front card in review. Flick right to mark reviewed, left to skip. */
export function ReviewCard({
  id,
  children,
  onReviewed,
  onSkip,
}: {
  id: string;
  children: ReactNode;
  onReviewed: () => void;
  onSkip: () => void;
}) {
  const x = useSharedValue(0);

  useEffect(() => {
    x.value = 0;
  }, [id, x]);

  const pan = Gesture.Pan()
    .activeOffsetX([-14, 14])
    .onUpdate((event) => {
      x.value = event.translationX;
    })
    .onEnd((event) => {
      if (event.translationX > 120) {
        x.value = withTiming(FLY, { duration: 200 }, (finished) => {
          if (finished) runOnJS(onReviewed)();
        });
        return;
      }
      if (event.translationX < -120) {
        x.value = withTiming(-FLY, { duration: 200 }, (finished) => {
          if (finished) runOnJS(onSkip)();
        });
        return;
      }
      x.value = withSpring(0, { stiffness: 380, damping: 28 });
    });

  const card = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { rotate: `${x.value / 28}deg` }],
  }));
  const body = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, Math.abs(x.value) / 70) }));
  const reviewed = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, x.value / 90)) }));
  const skip = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, -x.value / 90)) }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[{ borderRadius: 28, backgroundColor: colors.fill, minHeight: 440, overflow: "hidden", borderWidth: 1, borderColor: colors.lineStrong }, card]}>
        <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "rgba(61, 190, 154, 0.18)" }, reviewed]}>
          <View style={badge(colors.positive)}>
            <Text style={{ color: "#fff", fontSize: 22, fontWeight: "700" }}>✓</Text>
          </View>
          <Text style={{ color: colors.ink, fontSize: 32, fontWeight: "700", letterSpacing: -0.8, textAlign: "center" }}>Reviewed</Text>
        </Animated.View>
        <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: colors.fillStrong }, skip]}>
          <View style={badge(colors.ink)}>
            <Text style={{ color: colors.bg, fontSize: 18, fontWeight: "700" }}>▸</Text>
          </View>
          <Text style={{ color: colors.ink, fontSize: 32, fontWeight: "700", letterSpacing: -0.8, textAlign: "center" }}>Skip</Text>
        </Animated.View>
        <Animated.View style={[{ flex: 1 }, body]}>{children}</Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

function badge(backgroundColor: string) {
  return {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  };
}
