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
    transform: [{ translateX: x.value }, { rotate: `${x.value / 22}deg` }],
  }));
  const reviewed = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, x.value / 80)) }));
  const skip = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, -x.value / 80)) }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[{ borderRadius: 28, backgroundColor: colors.card, minHeight: 420, overflow: "hidden" }, card]}>
        <Animated.View pointerEvents="none" style={[{ position: "absolute", top: 28, left: 0, right: 0, alignItems: "center", zIndex: 2, gap: 8 }, reviewed]}>
          <View style={badge("#fff")}>
            <Text style={{ fontSize: 18, fontWeight: "700" }}>✓</Text>
          </View>
          <Text style={{ color: colors.ink, fontSize: 28, fontWeight: "700", letterSpacing: -0.6, textAlign: "center" }}>Mark as{"\n"}reviewed</Text>
        </Animated.View>
        <Animated.View pointerEvents="none" style={[{ position: "absolute", top: 28, left: 0, right: 0, alignItems: "center", zIndex: 2, gap: 8 }, skip]}>
          <View style={badge(colors.fillStrong)}>
            <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "700" }}>▸</Text>
          </View>
          <Text style={{ color: colors.ink, fontSize: 28, fontWeight: "700", letterSpacing: -0.6, textAlign: "center" }}>Skip{"\n"}for now</Text>
        </Animated.View>
        {children}
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
