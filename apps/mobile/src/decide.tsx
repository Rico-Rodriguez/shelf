import { ReactNode, useEffect } from "react";
import { Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { tapPress } from "./haptic";
import { Icon } from "./icons";
import { colors } from "./theme";

const FLY = 520;
const THRESHOLD = 100;

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
  const y = useSharedValue(0);
  const hapticTriggered = useSharedValue(0);

  useEffect(() => {
    x.value = 0;
    y.value = 0;
    hapticTriggered.value = 0;
  }, [id, x, y, hapticTriggered]);

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .onUpdate((event) => {
      x.value = event.translationX;
      y.value = event.translationY * 0.14;

      if (event.translationX > THRESHOLD && hapticTriggered.value !== 1) {
        hapticTriggered.value = 1;
        runOnJS(tapPress)();
      } else if (event.translationX < -THRESHOLD && hapticTriggered.value !== -1) {
        hapticTriggered.value = -1;
        runOnJS(tapPress)();
      } else if (Math.abs(event.translationX) < THRESHOLD * 0.6) {
        hapticTriggered.value = 0;
      }
    })
    .onEnd((event) => {
      const isRight = event.translationX > THRESHOLD || event.velocityX > 600;
      const isLeft = event.translationX < -THRESHOLD || event.velocityX < -600;

      if (isRight) {
        x.value = withTiming(FLY, { duration: 220 }, (finished) => {
          if (finished) runOnJS(onReviewed)();
        });
        y.value = withTiming(y.value * 1.5, { duration: 220 });
        return;
      }

      if (isLeft) {
        x.value = withTiming(-FLY, { duration: 220 }, (finished) => {
          if (finished) runOnJS(onSkip)();
        });
        y.value = withTiming(y.value * 1.5, { duration: 220 });
        return;
      }

      x.value = withSpring(0, { stiffness: 320, damping: 26, mass: 0.8 });
      y.value = withSpring(0, { stiffness: 320, damping: 26, mass: 0.8 });
      hapticTriggered.value = 0;
    });

  const cardStyle = useAnimatedStyle(() => {
    const rotate = (x.value / 320) * 14;
    return {
      transform: [
        { translateX: x.value },
        { translateY: y.value },
        { rotate: `${rotate}deg` },
      ],
    };
  });

  const bodyStyle = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(x.value), [140, 360], [1, 0.4], Extrapolation.CLAMP),
  }));

  const reviewedBadgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [25, 90], [0, 1], Extrapolation.CLAMP),
    transform: [
      { rotate: "-10deg" },
      { scale: interpolate(x.value, [25, 90], [0.85, 1], Extrapolation.CLAMP) },
    ],
  }));

  const skipBadgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [-90, -25], [1, 0], Extrapolation.CLAMP),
    transform: [
      { rotate: "10deg" },
      { scale: interpolate(x.value, [-90, -25], [1, 0.85], Extrapolation.CLAMP) },
    ],
  }));

  const rightTintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [0, 120], [0, 0.12], Extrapolation.CLAMP),
  }));

  const leftTintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [-120, 0], [0.12, 0], Extrapolation.CLAMP),
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          {
            borderRadius: 28,
            backgroundColor: colors.card,
            minHeight: 460,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: colors.lineStrong,
            shadowColor: "#000",
            shadowOpacity: 0.14,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 8 },
            elevation: 6,
          },
          cardStyle,
        ]}
      >
        {/* Subtle dynamic corner glow on right drag */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              backgroundColor: colors.positive,
            },
            rightTintStyle,
          ]}
        />

        {/* Subtle dynamic corner glow on left drag */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              backgroundColor: colors.fillStrong,
            },
            leftTintStyle,
          ]}
        />

        {/* Tactile "REVIEWED" Stamp Badge in Top Right */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: 24,
              right: 24,
              zIndex: 20,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 12,
              borderWidth: 2,
              borderColor: colors.positive,
              backgroundColor: colors.card,
              shadowColor: colors.positive,
              shadowOpacity: 0.25,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
            },
            reviewedBadgeStyle,
          ]}
        >
          <Icon name="check" size={18} color={colors.positive} filled />
          <Text
            style={{
              color: colors.positive,
              fontSize: 15,
              fontWeight: "800",
              letterSpacing: 0.8,
            }}
          >
            REVIEW
          </Text>
        </Animated.View>

        {/* Tactile "SKIP" Stamp Badge in Top Left */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: 24,
              left: 24,
              zIndex: 20,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 12,
              borderWidth: 2,
              borderColor: colors.tertiary,
              backgroundColor: colors.card,
              shadowColor: "#000",
              shadowOpacity: 0.15,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
            },
            skipBadgeStyle,
          ]}
        >
          <Icon name="skip" size={16} color={colors.muted} />
          <Text
            style={{
              color: colors.muted,
              fontSize: 15,
              fontWeight: "800",
              letterSpacing: 0.8,
            }}
          >
            SKIP
          </Text>
        </Animated.View>

        {/* Card Body - Stays crisp and legible */}
        <Animated.View style={[{ flex: 1 }, bodyStyle]}>{children}</Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}
