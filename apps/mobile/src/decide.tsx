import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type TextStyle,
} from "react-native";
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
import { api, peek } from "./api";
import { CategoryPicker, Charge, ChargeGroup, getCategoryColor } from "./charge";
import { dayLabel, flowMoney, fundedRemaining, money, saveUpGoalForCategory } from "./format";
import { anchorRect, playFlight, previewGoalRemaining, useFlightHidden, useMeasuredAnchor, type FlightPiece } from "./flight";
import { matchesMerchantRule } from "./review-flow";
import { tapMedium, tapPress, tapSelect, tapSuccess } from "./haptic";
import { Icon, MerchantMark } from "./icons";
import { useReduceMotion, useTheme, themedStyles } from "./theme";
import { ConfirmMark } from "./toast";
import { Sheet } from "./ui";

export type { ChargeGroup };


const SWIPE_THRESHOLD = 110;
const SWIPE_VELOCITY = 650;
const SPRING_SNAP = { damping: 20, stiffness: 240, mass: 0.8 };
const SPRING_DISMISS = { damping: 22, stiffness: 220, mass: 0.8 };

export function rankCategories(pool: string[], frequent: string[] = [], limit = 6): string[] {
  const score = new Map<string, number>();
  const bump = (id: string, amount: number) => score.set(id, (score.get(id) ?? 0) + amount);
  frequent.forEach((id, index) => bump(id, (frequent.length - index) * 2));
  const ranked = pool.filter((id) => (score.get(id) ?? 0) > 0).sort((a, b) => (score.get(b) ?? 0) - (score.get(a) ?? 0));
  const picked = [...ranked];
  for (const id of pool) {
    if (picked.length >= limit) break;
    if (!picked.includes(id)) picked.push(id);
  }
  return picked.slice(0, limit);
}


function ReviewAmount({
  anchor,
  text,
  color,
  style,
}: {
  anchor?: string;
  text: string;
  color: string;
  style: StyleProp<TextStyle>;
}) {
  const measure = useMeasuredAnchor(anchor, anchor ? { text, color, fontSize: 34 } : null);
  const opacity = useFlightHidden(anchor);
  return (
    <View {...measure} style={{ opacity }}>
      <Text style={[style, { color }]}>{text}</Text>
    </View>
  );
}

function CardContent({
  tx,
  face,
  flow,
  choices,
  selectedCategoryId,
  always = false,
  onAlwaysToggle,
  onFile,
  onMore,
  isInteractive = false,
  palette,
  similar,
  goalLine,
  amountAnchor,
}: {
  tx: Charge;
  face?: { monthCents: number; count: number };
  flow: { text: string; color: string };
  /** The guess first, then the likeliest others. */
  choices: { id: string; name: string; color?: string | null }[];
  selectedCategoryId?: string;
  always?: boolean;
  onAlwaysToggle?: () => void;
  onFile?: (id: string) => void;
  onMore?: () => void;
  isInteractive?: boolean;
  palette: ReturnType<typeof useTheme>["palette"];
  similar?: number | null;
  goalLine?: string | null;
  amountAnchor?: string;
}) {
  const styles = useStyles();
  const merchant = tx.merchantName || tx.name;
  const guess = choices.find((choice) => choice.id === selectedCategoryId) ?? null;

  return (
    <>
      <View style={styles.merchantRow}>
        <MerchantMark name={merchant} color={guess?.color ?? tx.category?.color ?? undefined} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={styles.merchantName}>
            {merchant}
          </Text>
          <Text numberOfLines={1} style={styles.categorySub}>
            {dayLabel(tx.date)}
            {tx.account?.name ? ` · ${tx.account.name}` : ""}
            {tx.pending ? " · Pending" : ""}
          </Text>
        </View>
      </View>

      <View style={styles.heroAmountRow}>
        <ReviewAmount anchor={amountAnchor} text={flow.text} color={flow.color} style={styles.heroAmount} />
        {face && face.monthCents > 0 ? (
          <View style={styles.contextBadge}>
            <Text style={styles.contextBadgeText}>{money(face.monthCents)} here this month</Text>
          </View>
        ) : null}
      </View>

      {/* One tap files it: the guess is filled, the others are outlined. */}
      <View style={{ gap: 8 }}>
        {choices.map((category) => {
          const on = category.id === selectedCategoryId;
          const tint = getCategoryColor(category);
          const body = (
            <>
              <View style={[styles.choiceDot, { backgroundColor: on ? "#ffffff" : tint }]} />
              <Text numberOfLines={1} style={[styles.choiceLabel, on && { color: "#ffffff" }]}>
                {category.name}
              </Text>
              {on ? <Icon name="check" size={16} color="#ffffff" /> : null}
            </>
          );
          const look = [styles.choice, on ? { backgroundColor: tint, borderColor: tint } : { borderColor: palette.line }];
          return isInteractive ? (
            <Pressable
              key={category.id}
              accessibilityRole="button"
              accessibilityLabel={`File as ${category.name}`}
              onPress={() => onFile?.(category.id)}
              style={({ pressed }) => [look, pressed && { transform: [{ scale: 0.98 }], opacity: 0.85 }]}
            >
              {body}
            </Pressable>
          ) : (
            <View key={category.id} style={look}>
              {body}
            </View>
          );
        })}
        <Pressable
          accessibilityRole="button"
          disabled={!isInteractive}
          onPress={onMore}
          style={({ pressed }) => [styles.choice, styles.choiceMore, { borderColor: palette.line }, pressed && { opacity: 0.7 }]}
        >
          <Icon name="tag" size={15} color={palette.muted} />
          <Text style={[styles.choiceLabel, { color: palette.muted }]}>Other category</Text>
          <Icon name="chevron" size={14} color={palette.tertiary} />
        </Pressable>
      </View>

      {goalLine ? <Text style={{ fontSize: 13, fontWeight: "600", color: palette.muted, paddingHorizontal: 2 }}>{goalLine}</Text> : null}

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: always }}
        disabled={!isInteractive}
        onPress={onAlwaysToggle}
        hitSlop={6}
        style={styles.alwaysRow}
      >
        <View style={[styles.checkBox, always ? { backgroundColor: palette.ink, borderColor: palette.ink } : { borderColor: palette.tertiary }]}>
          {always ? <Icon name="check" size={12} color={palette.bg} /> : null}
        </View>
        <Text numberOfLines={1} style={styles.alwaysText}>
          Always file {merchant} this way{always && similar ? ` · ${similar} more` : ""}
        </Text>
      </Pressable>
    </>
  );
}

export function ReviewDeck({
  rows,
  remaining,
  total,
  groups,
  frequentCategoryIds = [],
  faces = {},
  onConfirm,
  onSkip,
  onUndo,
  canUndo = false,
  onFileAll,
}: {
  rows: Charge[];
  remaining: number;
  total: number;
  groups: ChargeGroup[];
  frequentCategoryIds?: string[];
  faces?: Record<string, { monthCents: number; count: number }>;
  onConfirm: (
    tx: Charge,
    categoryId: string | null,
    always: boolean,
    goal: { id: string; name: string; remainingCents: number } | null,
  ) => void | Promise<void>;
  onSkip: (tx: Charge) => void;
  onUndo?: () => void;
  canUndo?: boolean;
  /** Files every card left with its guess; only offered when each one has a guess. */
  onFileAll?: { count: number; run: () => void };
}) {
  const styles = useStyles();
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.min(windowWidth - 32, 420);

  const current = rows[0];

  const [goals, setGoals] = useState<
    { id: string; name: string; kind: string; categoryId: string | null; remainingCents: number; targetDate: string | null }[]
  >(() => peek<{ goals: { id: string; name: string; kind: string; categoryId: string | null; remainingCents: number; targetDate: string | null }[] }>("/api/goals")?.goals ?? []);
  const [categoryId, setCategoryId] = useState(current?.categoryId ?? "");
  const [always, setAlways] = useState(false);
  const [picking, setPicking] = useState(false);
  const [departing, setDeparting] = useState<{
    tx: Charge;
    dir: "approve" | "skip";
    category: { id?: string; name: string; color?: string | null } | null;
    categoryId: string;
    always: boolean;
  } | null>(null);

  const currentRef = useRef(current);
  currentRef.current = current;
  const goalsRef = useRef(goals);
  goalsRef.current = goals;
  const currentId = current?.id ?? null;
  const taken = useRef<string | null>(null);
  const categoryRef = useRef(categoryId);
  const alwaysRef = useRef(always);
  categoryRef.current = categoryId;
  alwaysRef.current = always;
  const departX = useSharedValue(0);

  // Gesture and physics shared values
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const cardScale = useSharedValue(1);
  const holdRise = useSharedValue(0);
  const frontOpacity = useSharedValue(1);
  const hasTriggeredRightHaptic = useSharedValue(false);
  const hasTriggeredLeftHaptic = useSharedValue(false);
  const reduceMotion = useReduceMotion();
  const reduceRef = useRef(reduceMotion);
  reduceRef.current = reduceMotion;
  // Parent review updates land in the same turn as setDeparting, so the risen
  // card must drop back to a sliver before paint. Waiting for an effect shows
  // the card after the new front one at full size for a frame.
  const risenFor = useRef<string | null>(currentId);
  if (risenFor.current !== currentId) {
    risenFor.current = currentId;
    holdRise.value = 0;
    frontOpacity.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    cardScale.value = 1;
  }

  const pool = useMemo(
    () =>
      groups
        .filter((group) => !group.name.toLowerCase().includes("income"))
        .flatMap((group) => group.categories)
        .map((category) => category.id),
    [groups],
  );

  const byId = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color?: string | null }>();
    for (const group of groups) {
      for (const category of group.categories) map.set(category.id, category);
    }
    return map;
  }, [groups]);

  const quick = useMemo(() => {
    return rankCategories(pool, frequentCategoryIds, 5)
      .map((id) => byId.get(id))
      .filter((cat): cat is { id: string; name: string; color?: string | null } => Boolean(cat));
  }, [pool, frequentCategoryIds, byId]);
  const choicesFor = useCallback(
    (selected: string | null | undefined) => {
      const first = selected ? byId.get(selected) : undefined;
      const rest = quick.filter((cat) => cat.id !== selected);
      return (first ? [first, ...rest] : rest).slice(0, 3);
    },
    [byId, quick],
  );

  const face = current ? faces[current.merchantName || current.name] : undefined;
  const done = total > 0 ? Math.max(0, total - remaining) : 0;
  const progress = total > 0 ? Math.max(0, Math.min(100, (done / total) * 100)) : 0;

  const merchantKey = current ? current.merchantName || current.name : "";
  const similar = useMemo(() => {
    if (!current) return 0;
    return rows.filter((row) => row.id !== current.id && !row.reviewed && !row.hidden && matchesMerchantRule(row, merchantKey)).length;
  }, [rows, current, merchantKey]);
  const upcoming = useMemo(() => {
    if (!current) return [];
    const rest = rows.filter((row) => row.id !== current.id);
    if (!always) return rest;
    return rest.filter((row) => !matchesMerchantRule(row, merchantKey));
  }, [rows, current, always, merchantKey]);
  const nextCard = upcoming[0];

  useEffect(() => {
    void api<{ goals: { id: string; name: string; kind: string; categoryId: string | null; remainingCents: number; targetDate: string | null }[] }>("/api/goals")
      .then((res) => setGoals(res.goals))
      .catch(() => undefined);
  }, []);

  // Reset top card position and inputs when active card changes
  useEffect(() => {
    holdRise.value = 0;
    frontOpacity.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    cardScale.value = 1;
    hasTriggeredRightHaptic.value = false;
    hasTriggeredLeftHaptic.value = false;
    setCategoryId(current?.categoryId ?? "");
    setAlways(false);
    setPicking(false);
    if (taken.current && taken.current !== currentId) taken.current = null;
  }, [currentId]);

  const { palette } = useTheme();
  const isDark = palette.scheme === "dark";

  const clearDeparting = useCallback(() => {
    setDeparting(null);
    // A skip that does not advance the queue, or a spring that ends on the same card, has to bring the front card back.
    frontOpacity.value = 1;
    holdRise.value = 0;
  }, [frontOpacity, holdRise]);

  const commit = useCallback(
    (dir: "approve" | "skip", chosen?: string) => {
      const tx = currentRef.current;
      if (!tx || taken.current === tx.id) return;
      if (chosen) {
        categoryRef.current = chosen;
        setCategoryId(chosen);
      }
      // Accepting needs a category; with no guess, ask for one instead.
      if (dir === "approve" && !categoryRef.current) {
        translateX.value = withSpring(0, SPRING_SNAP);
        translateY.value = withSpring(0, SPRING_SNAP);
        setPicking(true);
        return;
      }
      taken.current = tx.id;
      const chosenId = categoryRef.current;
      const rule = alwaysRef.current && Boolean(chosenId);
      const category = chosenId ? byId.get(chosenId) ?? tx.category : tx.category;
      holdRise.value = 1;
      frontOpacity.value = 0;
      departX.value = translateX.value;
      translateX.value = 0;
      translateY.value = 0;
      cardScale.value = 1;
      setDeparting({ tx, dir, category: category ?? null, categoryId: chosenId, always: rule });
      const end = dir === "approve" ? windowWidth * 1.5 : -windowWidth * 1.5;
      if (reduceRef.current) {
        departX.value = end;
        clearDeparting();
      } else {
        departX.value = withSpring(end, SPRING_DISMISS, (finished) => {
          if (finished) runOnJS(clearDeparting)();
        });
      }
      if (dir === "approve") {
        tapSuccess();
        const matched = saveUpGoalForCategory(goalsRef.current, chosenId || null);
        const counts = Boolean(matched) && !tx.pending && !tx.hidden && tx.amountCents > 0 && tx.goalId !== matched?.id;
        const from = anchorRect("review.amount");
        const tint = getCategoryColor(category);
        const text = flowMoney(tx.amountCents).text;
        if (from && chosenId) {
          const pieces: FlightPiece[] = [
            {
              key: "plan",
              text,
              color: tint,
              fontSize: 34,
              fontWeight: "700" as const,
              from,
              toAnchor: `plan.bar.${chosenId}`,
              toFontSize: 8,
            },
            {
              key: "slice",
              kind: "fill" as const,
              text,
              color: tint,
              fontSize: 8,
              from,
              toAnchor: `today.slice.${chosenId}`,
              delay: 40,
            },
          ];
          if (matched && counts) {
            previewGoalRemaining(matched.id, matched.remainingCents, tx.amountCents);
            pieces.push({
              key: "goal",
              text: money(tx.amountCents),
              color: tint,
              fontSize: 34,
              fontWeight: "700",
              from,
              toAnchor: "money.remaining",
              toFontSize: 14,
              delay: 60,
            });
            pieces.push({
              key: "bar",
              kind: "fill",
              text: money(tx.amountCents),
              color: tint,
              fontSize: 8,
              from,
              toAnchor: `goal.bar.${matched.id}`,
              delay: 60,
            });
          }
          playFlight({ id: "filed", pieces }, reduceRef.current);
        }
        const goal = matched
          ? { id: matched.id, name: matched.name, remainingCents: fundedRemaining(matched.remainingCents, tx.amountCents, counts) }
          : null;
        void onConfirm(tx, chosenId || null, rule, goal);
      } else {
        tapPress();
        onSkip(tx);
      }
    },
    [byId, windowWidth, onConfirm, onSkip, departX, translateX, translateY, cardScale, holdRise, frontOpacity, clearDeparting],
  );

  const handleButtonDeny = useCallback(() => commit("skip"), [commit]);

  // Swipe gesture configuration
  const panGesture = useMemo(() => {
    return Gesture.Pan()
      .activeOffsetX([-10, 10])
      .onStart(() => {
        hasTriggeredRightHaptic.value = false;
        hasTriggeredLeftHaptic.value = false;
        cardScale.value = withSpring(1.02, { damping: 15, stiffness: 280 });
      })
      .onUpdate((event) => {
        translateX.value = event.translationX;
        translateY.value = event.translationY * 0.45;

        // Crossing right threshold haptic
        if (translateX.value > SWIPE_THRESHOLD && !hasTriggeredRightHaptic.value) {
          hasTriggeredRightHaptic.value = true;
          runOnJS(tapMedium)();
        } else if (translateX.value < SWIPE_THRESHOLD && hasTriggeredRightHaptic.value) {
          hasTriggeredRightHaptic.value = false;
        }

        // Crossing left threshold haptic
        if (translateX.value < -SWIPE_THRESHOLD && !hasTriggeredLeftHaptic.value) {
          hasTriggeredLeftHaptic.value = true;
          runOnJS(tapMedium)();
        } else if (translateX.value > -SWIPE_THRESHOLD && hasTriggeredLeftHaptic.value) {
          hasTriggeredLeftHaptic.value = false;
        }
      })
      .onEnd((event) => {
        cardScale.value = withSpring(1);

        const shouldApprove =
          translateX.value > SWIPE_THRESHOLD || event.velocityX > SWIPE_VELOCITY;
        const shouldDeny =
          translateX.value < -SWIPE_THRESHOLD || event.velocityX < -SWIPE_VELOCITY;

        if (shouldApprove) runOnJS(commit)("approve");
        else if (shouldDeny) runOnJS(commit)("skip");
        else {
          translateX.value = withSpring(0, SPRING_SNAP);
          translateY.value = withSpring(0, SPRING_SNAP);
        }
      });
  }, [
    commit,
    translateX,
    translateY,
    cardScale,
    hasTriggeredRightHaptic,
    hasTriggeredLeftHaptic,
  ]);

  const animatedDepartStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      departX.value,
      [-windowWidth * 0.75, 0, windowWidth * 0.75],
      [-16, 0, 16],
      Extrapolation.CLAMP,
    );
    return {
      transform: [{ translateX: departX.value }, { rotate: `${rotate}deg` }],
      zIndex: 30,
    };
  });

  // Top Card Animated Style
  const animatedTopCardStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      translateX.value,
      [-windowWidth * 0.75, 0, windowWidth * 0.75],
      [-16, 0, 16],
      Extrapolation.CLAMP,
    );
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotate}deg` },
        { scale: cardScale.value },
      ],
      opacity: frontOpacity.value,
    };
  });

  // Next card stays risen after a commit, instead of snapping back under the card that is leaving.
  const animatedNextCardStyle = useAnimatedStyle(() => {
    const dragged = interpolate(
      Math.abs(translateX.value),
      [0, SWIPE_THRESHOLD],
      [0, 1],
      Extrapolation.CLAMP,
    );
    const progressVal = holdRise.value === 1 ? 1 : dragged;
    const scale = interpolate(progressVal, [0, 1], [0.985, 1]);
    const transY = interpolate(progressVal, [0, 1], [-14, 0]);
    return {
      transform: [{ translateY: transY }, { scale }],
    };
  });

  // Approve Overlay Animated Style
  const animatedApproveOverlayStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [15, SWIPE_THRESHOLD * 0.75],
      [0, 1],
      Extrapolation.CLAMP,
    );
    const scale = interpolate(
      translateX.value,
      [15, SWIPE_THRESHOLD],
      [0.92, 1],
      Extrapolation.CLAMP,
    );
    return {
      opacity,
      transform: [{ scale }],
    };
  });

  // Skip Overlay Animated Style
  const animatedSkipOverlayStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [-15, -SWIPE_THRESHOLD * 0.75],
      [0, 1],
      Extrapolation.CLAMP,
    );
    const scale = interpolate(
      translateX.value,
      [-15, -SWIPE_THRESHOLD],
      [0.92, 1],
      Extrapolation.CLAMP,
    );
    return {
      opacity,
      transform: [{ scale }],
    };
  });

  const approveGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [15, SWIPE_THRESHOLD], [0, 0.45], Extrapolation.CLAMP),
  }));

  const skipGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-15, -SWIPE_THRESHOLD], [0, 0.45], Extrapolation.CLAMP),
  }));

  const meterWidth = useSharedValue(0);
  const [meterTrack, setMeterTrack] = useState(0);
  useEffect(() => {
    const target = meterTrack * (progress / 100);
    meterWidth.value = reduceMotion ? target : withTiming(target, { duration: 320 });
  }, [progress, meterTrack, reduceMotion, meterWidth]);
  const meterStyle = useAnimatedStyle(() => ({ width: meterWidth.value }));

  if (!current) {
    return (
      <View style={styles.emptyContainer}>
        <ConfirmMark size={68} />
        <Text style={styles.emptyTitle}>You’re All Caught Up!</Text>
        <Text style={styles.emptySubtitle}>
          Every transaction has been reviewed.
        </Text>
        {canUndo && onUndo ? (
          <Pressable
            onPress={() => {
              tapPress();
              onUndo();
            }}
            style={styles.undoCaughtUpButton}
          >
            <Icon name="undo" size={16} color={palette.accentInk} />
            <Text style={styles.undoCaughtUpText}>Undo last review</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const currentCategory = categoryId ? byId.get(categoryId) : current.category;
  const matchedGoal = saveUpGoalForCategory(goals, categoryId || null);
  const goalLine = matchedGoal ? `Count toward ${matchedGoal.name}` : null;
  const flow = flowMoney(current.amountCents);

  return (
    <View style={styles.container}>
      {/* Top Progress & Queue Header */}
      <View style={styles.meterWrapper}>
        <View style={styles.meterContainer} onLayout={(event) => setMeterTrack(event.nativeEvent.layout.width)}>
          <Animated.View style={[styles.meterFill, meterStyle]} />
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>
            <Text style={styles.metaHighlight}>{remaining}</Text> remaining
            {total > remaining ? ` · ${done} done` : ""}
          </Text>

        </View>
      </View>

      {/* Card Stack Area */}
      <View style={styles.cardArea}>
        <View style={{ width: cardWidth }}>
        {/* The next card shares the front card's box and rests as a top-edge sliver. */}
        {nextCard ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.cardSurface,
              styles.stackedCard,
              {
                left: 0,
                right: 0,
                top: 0,
                borderTopColor: palette.specularTop,
                borderBottomColor: palette.specularBottom,
                borderLeftColor: palette.specularSides,
                borderRightColor: palette.specularSides,
                backgroundColor: palette.bg,
              },
              animatedNextCardStyle,
            ]}
          >
                        <CardContent
              tx={nextCard}
              face={faces[nextCard.merchantName || nextCard.name]}
              flow={flowMoney(nextCard.amountCents)}
              choices={choicesFor(nextCard.categoryId)}
              selectedCategoryId={nextCard.categoryId ?? undefined}
              isInteractive={false}
              palette={palette}
            />
          </Animated.View>
        ) : null}

        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              styles.cardSurface,
              styles.topCard,
              {
                width: cardWidth,
                borderTopColor: palette.specularTop,
                borderBottomColor: palette.specularBottom,
                borderLeftColor: palette.specularSides,
                borderRightColor: palette.specularSides,
                backgroundColor: palette.bg,
              },
              animatedTopCardStyle,
            ]}
          >
            
            <Animated.View pointerEvents="none" style={[styles.glowBorder, { borderColor: palette.positive }, approveGlowStyle]} />
            <Animated.View pointerEvents="none" style={[styles.glowBorder, { borderColor: palette.tertiary }, skipGlowStyle]} />

            {/* Reactive Overlay: APPROVE */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.cardOverlay,
                styles.approveOverlay,
                animatedApproveOverlayStyle,
              ]}
            >
              <View style={[styles.overlayPill, { backgroundColor: isDark ? "rgba(12, 32, 24, 0.94)" : palette.card, borderColor: palette.positive }]}>
                <View style={[styles.overlayIconCircle, { backgroundColor: palette.accentSoft }]}>
                  <Icon name="check" size={20} color={palette.positive} />
                </View>
                <Text style={[styles.approveOverlayText, { color: palette.positive }]}>{currentCategory ? currentCategory.name : "Pick a category"}</Text>
              </View>
            </Animated.View>

            {/* Reactive Overlay: SKIP */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.cardOverlay,
                styles.skipOverlay,
                animatedSkipOverlayStyle,
              ]}
            >
              <View style={[styles.overlayPill, { backgroundColor: palette.card, borderColor: palette.tertiary }]}>
                <View style={[styles.overlayIconCircle, { backgroundColor: palette.fill }]}>
                  <Icon name="skip" size={20} color={palette.muted} />
                </View>
                <Text style={[styles.skipOverlayText, { color: palette.muted }]}>Later</Text>
              </View>
            </Animated.View>

            <CardContent
              tx={current}
              face={face}
              flow={flow}
              choices={choicesFor(current.categoryId)}
              selectedCategoryId={categoryId}
              amountAnchor="review.amount"
              always={always}
              onAlwaysToggle={() => {
                tapSelect();
                setAlways((value) => !value);
              }}
              onMore={() => {
                tapPress();
                setPicking(true);
              }}
              onFile={(id) => commit("approve", id)}
              isInteractive={true}
              palette={palette}
              similar={similar}
              goalLine={goalLine}
            />
          </Animated.View>
        </GestureDetector>
        {departing ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.cardSurface,
              styles.topCard,
              {
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                borderTopColor: palette.specularTop,
                borderBottomColor: palette.specularBottom,
                borderLeftColor: palette.specularSides,
                borderRightColor: palette.specularSides,
                backgroundColor: palette.bg,
              },
              animatedDepartStyle,
            ]}
          >
            <CardContent
              tx={departing.tx}
              face={faces[departing.tx.merchantName || departing.tx.name]}
              flow={flowMoney(departing.tx.amountCents)}
              choices={choicesFor(departing.categoryId || departing.tx.categoryId)}
              selectedCategoryId={departing.categoryId}
              always={departing.always}
              isInteractive={false}
              palette={palette}
              similar={departing.always ? similar : 0}
              goalLine={saveUpGoalForCategory(goals, departing.categoryId || null) ? `Count toward ${saveUpGoalForCategory(goals, departing.categoryId || null)?.name}` : null}
            />
          </Animated.View>
        ) : null}
        </View>
      </View>

      {/* Under the card: Later on the left, and a way through a backlog of guesses on the right. */}
      <View style={[styles.footRow, { width: cardWidth }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Later"
          onPress={handleButtonDeny}
          hitSlop={8}
          style={({ pressed }) => [styles.footBtn, { backgroundColor: palette.fill }, pressed && { opacity: 0.7 }]}
        >
          <Icon name="skip" size={14} color={palette.muted} />
          <Text style={[styles.footLabel, { color: palette.ink }]}>Later</Text>
        </Pressable>
        {onFileAll && onFileAll.count >= 3 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              tapSuccess();
              onFileAll.run();
            }}
            hitSlop={8}
            style={({ pressed }) => [styles.footBtn, { backgroundColor: palette.ink }, pressed && { opacity: 0.85 }]}
          >
            <Icon name="check" size={14} color={palette.bg} />
            <Text style={[styles.footLabel, { color: palette.bg }]}>File all {onFileAll.count} as suggested</Text>
          </Pressable>
        ) : canUndo && onUndo ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              tapPress();
              onUndo();
            }}
            hitSlop={8}
            style={({ pressed }) => [styles.footBtn, { backgroundColor: palette.fill }, pressed && { opacity: 0.7 }]}
          >
            <Icon name="undo" size={14} color={palette.muted} />
            <Text style={[styles.footLabel, { color: palette.ink }]}>Undo</Text>
          </Pressable>
        ) : (
          <Text style={styles.footHint}>Swipe right to accept</Text>
        )}
      </View>

      {/* Category Picker Sheet Modal */}
      {picking ? (
        <Sheet title="Choose a category" onClose={() => setPicking(false)}>
          <CategoryPicker
            groups={groups}
            selected={categoryId}
            onSelect={(id) => {
              setPicking(false);
              commit("approve", id);
            }}
            onClose={() => setPicking(false)}
          />
        </Sheet>
      ) : null}
    </View>
  );
}

const useStyles = themedStyles((colors) =>
  StyleSheet.create({
  choice: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  choiceMore: { borderStyle: "dashed" },
  footRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingTop: 12 },
  footBtn: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, flexDirection: "row", alignItems: "center", gap: 8 },
  footLabel: { fontSize: 15, fontWeight: "600", letterSpacing: -0.2 },
  footHint: { fontSize: 13, color: colors.tertiary },
  choiceDot: { width: 10, height: 10, borderRadius: 5 },
  choiceLabel: { flex: 1, fontSize: 16, fontWeight: "600", color: colors.ink, letterSpacing: -0.3 },
  alwaysRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  checkBox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  alwaysText: { flex: 1, fontSize: 14, fontWeight: "500", color: colors.muted },
  container: {
    flex: 1,
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  meterWrapper: {
    width: "100%",
    paddingHorizontal: 8,
    gap: 8,
    marginBottom: 8,
  },
  meterContainer: {
    height: 4,
    width: "100%",
    backgroundColor: colors.fill,
    borderRadius: 99,
    overflow: "hidden",
  },
  meterFill: {
    height: "100%",
    backgroundColor: colors.accent,
    borderRadius: 99,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metaText: {
    fontSize: 13,
    color: colors.muted,
    letterSpacing: -0.1,
  },
  metaHighlight: {
    fontWeight: "700",
    color: colors.ink,
  },
  cardArea: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    marginVertical: 4,
  },
  cardSurface: {
    borderRadius: 26,
    borderCurve: "continuous",
    borderWidth: 1,
    padding: 18,
    gap: 12,
    position: "relative",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  stackedCard: {
    position: "absolute",
    zIndex: 1,
  },
  topCard: {
    zIndex: 10,
  },
  glowBorder: {
    ...StyleSheet.absoluteFill,
    borderRadius: 26,
    borderWidth: 2.5,
    zIndex: 4,
  },
  cardOverlay: {
    ...StyleSheet.absoluteFill,
    borderRadius: 26,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 25,
    overflow: "hidden",
  },
  approveOverlay: {
    backgroundColor: "rgba(27, 122, 98, 0.12)",
  },
  skipOverlay: {
    backgroundColor: "rgba(217, 74, 46, 0.12)",
  },
  overlayPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    borderCurve: "continuous",
    borderWidth: 1.5,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  overlayIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  approveOverlayText: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: colors.positive,
  },
  skipOverlayText: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: colors.danger,
  },
  merchantRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  merchantName: {
    fontSize: 19,
    fontWeight: "700",
    letterSpacing: -0.4,
    color: colors.ink,
  },
  categorySub: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
    letterSpacing: -0.1,
  },
  heroAmountRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
  },
  heroAmount: {
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -1,
    fontVariant: ["tabular-nums"],
  },
  contextBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
    backgroundColor: colors.fill,
  },
  contextBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
  },
  selectedCategoryPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 1.5,
  },
  selectedCategoryLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  categoryDotLarge: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  categoryPillSub: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.tertiary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  categoryPillName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.2,
  },
  changeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 99,
    backgroundColor: colors.fill,
  },
  changeBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.tertiary,
  },
  chipsSection: {
    gap: 6,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.tertiary,
    letterSpacing: -0.1,
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.fill,
    borderWidth: 1,
    borderColor: "transparent",
  },
  chipSelected: {
    borderWidth: 1.5,
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.ink,
  },
  chipLabelSelected: {
    fontWeight: "700",
    color: colors.accentInk,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.fill,
    borderRadius: 14,
    borderCurve: "continuous",
  },
  switchTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.ink,
  },
  switchSubtitle: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  ruleChip: {
    alignSelf: "flex-start",
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
    backgroundColor: colors.accentSoft,
  },
  ruleChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.accentInk,
  },
  gestureHintRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingTop: 2,
  },
  gestureHintText: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.tertiary,
    letterSpacing: -0.1,
  },
  actionDock: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 24,
    borderCurve: "continuous",
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    marginBottom: 4,
  },
  dockUtilityGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dockIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderCurve: "continuous",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dockDivider: {
    width: 1,
    height: 22,
    marginHorizontal: 4,
  },
  dockDecisionGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    justifyContent: "flex-end",
  },
  dockPillBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 38,
    paddingHorizontal: 16,
    borderRadius: 19,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  dockSkipBtn: {
    flex: 1,
    maxWidth: 105,
  },
  dockApproveBtn: {
    flex: 1.3,
    maxWidth: 135,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  dockBtnLabel: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  dockApproveText: {
    color: "#ffffff",
    fontWeight: "700",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.5,
    color: colors.ink,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 20,
  },
  undoCaughtUpButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 99,
    backgroundColor: colors.fill,
  },
  undoCaughtUpText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.accentInk,
  },
  }),
);
