import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { tapMedium, tapPress } from "./haptic";
import { Icon } from "./icons";
import { colors } from "./theme";

const BUTTON_WIDTH = 76;
const SPRING_CONFIG = { stiffness: 420, damping: 32, mass: 0.8 };

export type SwipeAction = {
  label: string;
  tone: "ink" | "danger" | "accent";
  icon?: string;
  onPress: () => void;
};

function actionIconName(label: string, fallback?: string): string | null {
  if (fallback) return fallback;
  const l = label.toLowerCase();
  if (l.includes("done") || l.includes("review")) return "check";
  if (l.includes("edit")) return "pencil";
  if (l.includes("hide") || l.includes("delete")) return "close";
  return null;
}

export function SwipeRow({
  children,
  actions,
  peek = false,
  divided = false,
  onPress,
  onSwipeRight,
  swipeRightLabel = "Review",
}: {
  children: ReactNode;
  actions: SwipeAction[];
  peek?: boolean;
  divided?: boolean;
  onPress?: () => void;
  onSwipeRight?: () => void;
  swipeRightLabel?: string;
}) {
  const totalActionsWidth = Math.max(BUTTON_WIDTH, actions.length * BUTTON_WIDTH);
  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);
  const hasTriggeredRightHaptic = useSharedValue(false);
  const hasTriggeredLeftHaptic = useSharedValue(false);

  const RIGHT_THRESHOLD = 80;

  const panGesture = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-12, 12])
    .onStart(() => {
      startX.value = translateX.value;
      hasTriggeredRightHaptic.value = false;
      hasTriggeredLeftHaptic.value = false;
    })
    .onUpdate((event) => {
      const raw = startX.value + event.translationX;
      if (raw > 0) {
        if (onSwipeRight) {
          // Responsive pull with progressive spring resistance beyond threshold
          if (raw <= RIGHT_THRESHOLD) {
            translateX.value = raw;
          } else {
            translateX.value = RIGHT_THRESHOLD + Math.pow(raw - RIGHT_THRESHOLD, 0.72);
          }
          if (translateX.value >= RIGHT_THRESHOLD && !hasTriggeredRightHaptic.value) {
            hasTriggeredRightHaptic.value = true;
            runOnJS(tapMedium)();
          }
        } else {
          // Rubberband resistance when no right action
          translateX.value = Math.pow(raw, 0.75);
        }
      } else if (raw < -totalActionsWidth) {
        // Rubberband resistance past actions width
        const overflow = raw + totalActionsWidth;
        translateX.value = -totalActionsWidth - Math.pow(Math.abs(overflow), 0.75);
      } else {
        translateX.value = raw;
      }

      if (translateX.value < -totalActionsWidth * 0.75 && !hasTriggeredLeftHaptic.value) {
        hasTriggeredLeftHaptic.value = true;
        runOnJS(tapMedium)();
      }
    })
    .onEnd((event) => {
      if (translateX.value > 0 && onSwipeRight) {
        const shouldTrigger = translateX.value >= RIGHT_THRESHOLD || event.velocityX > 500;
        if (shouldTrigger) {
          translateX.value = withSpring(0, SPRING_CONFIG);
          runOnJS(onSwipeRight)();
        } else {
          translateX.value = withSpring(0, SPRING_CONFIG);
        }
      } else {
        const shouldOpen =
          translateX.value < -totalActionsWidth * 0.4 || event.velocityX < -400;

        if (shouldOpen) {
          translateX.value = withSpring(-totalActionsWidth, SPRING_CONFIG);
        } else {
          translateX.value = withSpring(0, SPRING_CONFIG);
        }
      }
    });

  const rowAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const actionsContainerStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [-totalActionsWidth, -16, 0],
      [1, 0.7, 0],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  const leadingContainerStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [0, 20, RIGHT_THRESHOLD],
      [0, 0.6, 1],
      Extrapolation.CLAMP,
    );
    const scale = interpolate(
      translateX.value,
      [0, 30, RIGHT_THRESHOLD],
      [0.5, 0.85, 1.05],
      Extrapolation.CLAMP,
    );
    return {
      opacity,
      transform: [{ scale }],
    };
  });

  function closeRow() {
    translateX.value = withSpring(0, SPRING_CONFIG);
  }

  function handleActionPress(action: SwipeAction) {
    tapPress();
    closeRow();
    action.onPress();
  }

  const toneBackgrounds = {
    ink: colors.ink,
    danger: colors.danger,
    accent: colors.accent,
  };

  const toneTextColors = {
    ink: colors.controlInk,
    danger: "#ffffff",
    accent: colors.controlInk,
  };

  return (
    <View style={[styles.wrapper, divided && styles.divided]}>
      {/* Leading Action Revealed from the Left (Swipe Right) */}
      {onSwipeRight ? (
        <View style={styles.leadingContainer}>
          <Animated.View style={[styles.leadingContent, leadingContainerStyle]}>
            <View style={styles.leadingIconWrap}>
              <Icon name="check" size={20} color="#ffffff" filled />
            </View>
            <Text style={styles.leadingLabel}>{swipeRightLabel}</Text>
          </Animated.View>
        </View>
      ) : null}

      {/* Action Buttons Revealed from the Right (Swipe Left) */}
      <Animated.View
        style={[
          styles.actionsContainer,
          { width: totalActionsWidth },
          actionsContainerStyle,
        ]}
      >
        {actions.map((action) => {
          const icon = actionIconName(action.label, action.icon);
          const bg = toneBackgrounds[action.tone];
          const text = toneTextColors[action.tone];
          return (
            <Pressable
              key={action.label}
              onPress={() => handleActionPress(action)}
              style={({ pressed }) => [
                styles.actionBtn,
                { width: totalActionsWidth / actions.length, backgroundColor: bg },
                pressed && { opacity: 0.85 },
              ]}
            >
              {icon ? (
                <View style={styles.actionIconWrap}>
                  <Icon name={icon} size={18} color={text} filled={action.tone === "accent"} />
                </View>
              ) : null}
              <Text style={[styles.actionLabel, { color: text }]}>{action.label}</Text>
            </Pressable>
          );
        })}
      </Animated.View>

      {/* Main Swipeable Row Content */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.frontRow, rowAnimatedStyle]}>
          <Pressable
            onPress={() => {
              if (translateX.value !== 0) {
                closeRow();
                return;
              }
              tapPress();
              onPress?.();
            }}
            style={({ pressed }) => (pressed ? { backgroundColor: colors.fill } : null)}
          >
            {children}
            {peek ? <View pointerEvents="none" style={styles.peekIndicator} /> : null}
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    overflow: "hidden",
    position: "relative",
  },
  divided: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  actionsContainer: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "flex-end",
  },
  actionBtn: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 8,
  },
  actionIconWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: -0.1,
  },
  leadingContainer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    right: 0,
    backgroundColor: colors.positive,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 20,
  },
  leadingContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  leadingIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  leadingLabel: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  frontRow: {
    backgroundColor: colors.card,
  },
  peekIndicator: {
    position: "absolute",
    right: 0,
    top: 10,
    bottom: 10,
    width: 3.5,
    borderRadius: 99,
    backgroundColor: colors.accent,
  },
});
