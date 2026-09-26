import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
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
import { BlurView } from "expo-blur";
import { api } from "./api";
import { CategoryPicker, Charge, ChargeGroup, getCategoryColor } from "./charge";
import { dayLabel, flowMoney, merchantMatchKey, money } from "./format";
import { tapCelebration, tapMedium, tapPress, tapSelect, tapSuccess } from "./haptic";
import { Icon, MerchantMark } from "./icons";
import { useReduceTransparency, useTheme } from "./theme";
import { ConfirmMark } from "./toast";
import { colors, Sheet, Switch } from "./ui";

export type { ChargeGroup };

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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


function CardContent({
  tx,
  currentCategory,
  face,
  flow,
  quick,
  selectedCategoryId,
  always = false,
  onAlwaysToggle,
  onCategoryPress,
  onQuickCategorySelect,
  isInteractive = false,
  palette,
  isDark,
  similar,
}: {
  tx: Charge;
  currentCategory?: { id?: string; name: string; color?: string | null } | null;
  face?: { monthCents: number; count: number };
  flow: { text: string; color: string };
  quick: { id: string; name: string; color?: string | null }[];
  selectedCategoryId?: string;
  always?: boolean;
  onAlwaysToggle?: () => void;
  onCategoryPress?: () => void;
  onQuickCategorySelect?: (id: string) => void;
  isInteractive?: boolean;
  palette: ReturnType<typeof useTheme>["palette"];
  isDark: boolean;
  similar?: number | null;
}) {
  const merchant = tx.merchantName || tx.name;

  return (
    <>
      {/* Header */}
      <View style={styles.merchantRow}>
        <MerchantMark name={merchant} color={currentCategory?.color ?? undefined} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={styles.merchantName}>
            {tx.name}
          </Text>
          <Text numberOfLines={1} style={styles.categorySub}>
            {dayLabel(tx.date)}
            {tx.account?.name ? ` · ${tx.account.name}` : ""}
            {tx.pending ? " · Pending" : ""}
          </Text>
        </View>
      </View>

      {/* Big Flow Amount */}
      <View style={styles.heroAmountRow}>
        <Text style={[styles.heroAmount, { color: flow.color }]}>
          {flow.text}
        </Text>
        {face && face.monthCents > 0 ? (
          <View style={styles.contextBadge}>
            <Text style={styles.contextBadgeText}>
              {money(face.monthCents)} this month
            </Text>
          </View>
        ) : null}
      </View>

      {/* Category selector / preview pill */}
      {isInteractive ? (
        <Pressable
          onPress={onCategoryPress}
          style={[
            styles.selectedCategoryPill,
            {
              backgroundColor: isDark ? "rgba(255, 255, 255, 0.05)" : palette.fill,
              borderColor: currentCategory ? getCategoryColor(currentCategory) : palette.line,
            },
          ]}
        >
          <View style={styles.selectedCategoryLeft}>
            <View
              style={[
                styles.categoryDotLarge,
                { backgroundColor: currentCategory ? getCategoryColor(currentCategory) : colors.muted },
              ]}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.categoryPillSub}>Category</Text>
              <Text numberOfLines={1} style={styles.categoryPillName}>
                {currentCategory?.name ?? "Choose a category"}
              </Text>
            </View>
          </View>
          <View style={styles.changeBadge}>
            <Text style={styles.changeBadgeText}>Change</Text>
            <Icon name="chevron" size={14} color={palette.tertiary} />
          </View>
        </Pressable>
      ) : (
        <View
          style={[
            styles.selectedCategoryPill,
            {
              backgroundColor: isDark ? "rgba(255, 255, 255, 0.05)" : palette.fill,
              borderColor: currentCategory ? getCategoryColor(currentCategory) : palette.line,
            },
          ]}
        >
          <View style={styles.selectedCategoryLeft}>
            <View
              style={[
                styles.categoryDotLarge,
                { backgroundColor: currentCategory ? getCategoryColor(currentCategory) : colors.muted },
              ]}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.categoryPillSub}>Category</Text>
              <Text numberOfLines={1} style={styles.categoryPillName}>
                {currentCategory?.name ?? "Choose a category"}
              </Text>
            </View>
          </View>
          <View style={styles.changeBadge}>
            <Text style={styles.changeBadgeText}>Change</Text>
            <Icon name="chevron" size={14} color={palette.tertiary} />
          </View>
        </View>
      )}

      {/* Quick Category Chips */}
      <View style={styles.chipsSection}>
        <Text style={styles.sectionHeader}>Quick suggestions</Text>
        <View style={styles.chipGrid}>
          {quick.map((category) => {
            const isSelected = selectedCategoryId === category.id;
            const catColor = category.color
              ? getCategoryColor(category)
              : colors.accent;
            if (isInteractive) {
              return (
                <Pressable
                  key={category.id}
                  onPress={() => onQuickCategorySelect?.(category.id)}
                  style={[
                    styles.chip,
                    isSelected && [
                      styles.chipSelected,
                      {
                        backgroundColor: isDark
                          ? "rgba(27, 122, 98, 0.28)"
                          : colors.accentSoft,
                        borderColor: catColor,
                      },
                    ],
                  ]}
                >
                  <View
                    style={[
                      styles.chipDot,
                      { backgroundColor: catColor },
                    ]}
                  />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.chipLabel,
                      isSelected && styles.chipLabelSelected,
                    ]}
                  >
                    {category.name}
                  </Text>
                </Pressable>
              );
            }
            return (
              <View
                key={category.id}
                style={[
                  styles.chip,
                  isSelected && [
                    styles.chipSelected,
                    {
                      backgroundColor: isDark
                        ? "rgba(27, 122, 98, 0.28)"
                        : colors.accentSoft,
                      borderColor: catColor,
                    },
                  ],
                ]}
              >
                <View
                  style={[
                    styles.chipDot,
                    { backgroundColor: catColor },
                  ]}
                />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.chipLabel,
                    isSelected && styles.chipLabelSelected,
                  ]}
                >
                  {category.name}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Always Categorize Rule Switch */}
      {isInteractive ? (
        <Pressable
          onPress={onAlwaysToggle}
          style={styles.switchRow}
        >
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={styles.switchTitle}>
              Always categorize {merchant}
            </Text>
            <Text style={styles.switchSubtitle}>
              {always && similar != null && similar > 0
                ? `⚡ Clears ${similar} other purchase${similar === 1 ? "" : "s"}`
                : `Remember this rule for future activity`}
            </Text>
          </View>
          <Switch on={always} />
        </Pressable>
      ) : (
        <View style={styles.switchRow}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={styles.switchTitle}>
              Always categorize {merchant}
            </Text>
            <Text style={styles.switchSubtitle}>
              Remember this rule for future activity
            </Text>
          </View>
          <Switch on={false} />
        </View>
      )}

      {/* Swipe hint */}
      <View style={styles.gestureHintRow}>
        <Icon name="chevron-left" size={12} color={colors.tertiary} />
        <Text style={styles.gestureHintText}>
          Swipe left to skip · right to approve
        </Text>
        <Icon name="chevron" size={12} color={colors.tertiary} />
      </View>
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
}: {
  rows: Charge[];
  remaining: number;
  total: number;
  groups: ChargeGroup[];
  frequentCategoryIds?: string[];
  faces?: Record<string, { monthCents: number; count: number }>;
  onConfirm: (tx: Charge, categoryId: string | null, always: boolean) => Promise<void>;
  onSkip: (tx: Charge) => void;
  onUndo?: () => void;
  canUndo?: boolean;
}) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const cardWidth = Math.min(windowWidth - 32, 420);

  const current = rows[0];
  const nextCard = rows[1];
  const thirdCard = rows[2];

  const [categoryId, setCategoryId] = useState(current?.categoryId ?? "");
  const [always, setAlways] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [similar, setSimilar] = useState<number | null>(null);

  const currentRef = useRef(current);
  currentRef.current = current;
  const currentId = current?.id ?? null;

  // Gesture and physics shared values
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const cardScale = useSharedValue(1);
  const hasTriggeredRightHaptic = useSharedValue(false);
  const hasTriggeredLeftHaptic = useSharedValue(false);

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

  const merchant = current ? current.merchantName || current.name : "";
  const face = current ? faces[current.merchantName || current.name] : undefined;
  const done = total > 0 ? Math.max(0, total - remaining) : 0;
  const progress = total > 0 ? Math.max(0, Math.min(100, (done / total) * 100)) : 0;

  // Reset top card position and inputs when active card changes
  useEffect(() => {
    translateX.value = 0;
    translateY.value = 0;
    cardScale.value = 1;
    hasTriggeredRightHaptic.value = false;
    hasTriggeredLeftHaptic.value = false;
    setIsDismissing(false);
    setCategoryId(current?.categoryId ?? "");
    setAlways(false);
    setSimilar(null);
    setBusy(false);
  }, [currentId]);

  // Preview similar matches for rule creation
  useEffect(() => {
    if (!always || !current) {
      setSimilar(null);
      return;
    }
    let active = true;
    setSimilar(null);
    void api<{ count: number }>("/api/rules/preview", {
      method: "POST",
      body: JSON.stringify({
        matchMerchant: merchantMatchKey(merchant),
        unreviewedOnly: true,
        excludeId: current.id,
      }),
    })
      .then((res) => {
        if (active) setSimilar(res.count);
      })
      .catch(() => {
        if (active) setSimilar(null);
      });
    return () => {
      active = false;
    };
  }, [always, merchant, current]);

  const { palette } = useTheme();
  const reduceTransparency = useReduceTransparency();
  const isDark = palette.scheme === "dark";

  // Callbacks for dismissal
  const finalizeApprove = useCallback(() => {
    const tx = currentRef.current;
    if (!tx) return;
    tapSuccess();
    setBusy(true);
    void onConfirm(tx, categoryId || null, always && Boolean(categoryId)).finally(() => {
      setBusy(false);
    });
  }, [categoryId, always, onConfirm]);

  const finalizeDeny = useCallback(() => {
    const tx = currentRef.current;
    if (!tx) return;
    tapPress();
    onSkip(tx);
  }, [onSkip]);

  // Programmatic Button Actions
  const handleButtonApprove = useCallback(() => {
    if (isDismissing || busy || !current) return;
    setIsDismissing(true);
    tapSuccess();
    translateX.value = withSpring(windowWidth * 1.5, SPRING_DISMISS, () => {
      runOnJS(finalizeApprove)();
    });
  }, [isDismissing, busy, current, windowWidth, finalizeApprove, translateX]);

  const handleButtonDeny = useCallback(() => {
    if (isDismissing || busy || !current) return;
    setIsDismissing(true);
    tapPress();
    translateX.value = withSpring(-windowWidth * 1.5, SPRING_DISMISS, () => {
      runOnJS(finalizeDeny)();
    });
  }, [isDismissing, busy, current, windowWidth, finalizeDeny, translateX]);

  // Swipe gesture configuration
  const panGesture = useMemo(() => {
    return Gesture.Pan()
      .activeOffsetX([-10, 10])
      .onStart(() => {
        if (isDismissing || busy) return;
        hasTriggeredRightHaptic.value = false;
        hasTriggeredLeftHaptic.value = false;
        cardScale.value = withSpring(1.02, { damping: 15, stiffness: 280 });
      })
      .onUpdate((event) => {
        if (isDismissing || busy) return;
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
        if (isDismissing || busy) return;
        cardScale.value = withSpring(1);

        const shouldApprove =
          translateX.value > SWIPE_THRESHOLD || event.velocityX > SWIPE_VELOCITY;
        const shouldDeny =
          translateX.value < -SWIPE_THRESHOLD || event.velocityX < -SWIPE_VELOCITY;

        if (shouldApprove) {
          runOnJS(setIsDismissing)(true);
          translateX.value = withSpring(
            windowWidth * 1.5,
            { velocity: event.velocityX, ...SPRING_DISMISS },
            () => {
              runOnJS(finalizeApprove)();
            },
          );
        } else if (shouldDeny) {
          runOnJS(setIsDismissing)(true);
          translateX.value = withSpring(
            -windowWidth * 1.5,
            { velocity: event.velocityX, ...SPRING_DISMISS },
            () => {
              runOnJS(finalizeDeny)();
            },
          );
        } else {
          translateX.value = withSpring(0, SPRING_SNAP);
          translateY.value = withSpring(0, SPRING_SNAP);
        }
      });
  }, [
    isDismissing,
    busy,
    windowWidth,
    finalizeApprove,
    finalizeDeny,
    translateX,
    translateY,
    cardScale,
    hasTriggeredRightHaptic,
    hasTriggeredLeftHaptic,
  ]);

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
    };
  });

  // Next Card (Card #2) Animated Style
  const animatedNextCardStyle = useAnimatedStyle(() => {
    const progressVal = interpolate(
      Math.abs(translateX.value),
      [0, SWIPE_THRESHOLD],
      [0, 1],
      Extrapolation.CLAMP,
    );
    const scale = interpolate(progressVal, [0, 1], [0.93, 1]);
    const transY = interpolate(progressVal, [0, 1], [14, 0]);
    const opacity = interpolate(progressVal, [0, 1], [0.85, 1]);
    return {
      transform: [{ translateY: transY }, { scale }],
      opacity,
    };
  });

  // Third Card (Card #3) Animated Style
  const animatedThirdCardStyle = useAnimatedStyle(() => {
    const progressVal = interpolate(
      Math.abs(translateX.value),
      [0, SWIPE_THRESHOLD],
      [0, 1],
      Extrapolation.CLAMP,
    );
    const scale = interpolate(progressVal, [0, 1], [0.86, 0.93]);
    const transY = interpolate(progressVal, [0, 1], [26, 14]);
    const opacity = interpolate(progressVal, [0, 1], [0.55, 0.85]);
    return {
      transform: [{ translateY: transY }, { scale }],
      opacity,
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

  // Dynamic Reactive Glow Border
  const animatedGlowStyle = useAnimatedStyle(() => {
    const approveGlow = interpolate(
      translateX.value,
      [15, SWIPE_THRESHOLD],
      [0, 0.45],
      Extrapolation.CLAMP,
    );
    const denyGlow = interpolate(
      translateX.value,
      [-15, -SWIPE_THRESHOLD],
      [0, 0.45],
      Extrapolation.CLAMP,
    );
    const active = Math.abs(translateX.value) > 15;
    return {
      opacity: active ? (translateX.value > 0 ? approveGlow : denyGlow) : 0,
      borderColor: translateX.value > 0 ? "#10b981" : "#f43f5e",
    };
  });

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
  const flow = flowMoney(current.amountCents);

  return (
    <View style={styles.container}>
      {/* Top Progress & Queue Header */}
      <View style={styles.meterWrapper}>
        <View style={styles.meterContainer}>
          <View style={[styles.meterFill, { width: `${progress}%` }]} />
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>
            <Text style={styles.metaHighlight}>{remaining}</Text> remaining
            {total > remaining ? ` · ${done} done` : ""}
          </Text>
          <Text style={styles.metaText}>
            {dayLabel(current.date)}
            {current.account?.name ? ` · ${current.account.name}` : ""}
          </Text>
        </View>
      </View>

      {/* Card Stack Area */}
      <View style={styles.cardArea}>
        {/* Card 3 (if exists) */}
        {thirdCard ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.cardSurface,
              styles.stackedCard,
              {
                width: cardWidth,
                borderTopColor: palette.specularTop,
                borderBottomColor: palette.specularBottom,
                borderLeftColor: palette.specularSides,
                borderRightColor: palette.specularSides,
                backgroundColor: reduceTransparency
                  ? isDark
                    ? "#171a21"
                    : "#ffffff"
                  : palette.glassProminent,
              },
              animatedThirdCardStyle,
            ]}
          >
            {!reduceTransparency ? (
              <BlurView
                intensity={isDark ? 50 : 75}
                tint={palette.blurTint}
                style={StyleSheet.absoluteFill}
              />
            ) : null}
            <CardContent
              tx={thirdCard}
              currentCategory={thirdCard.categoryId ? byId.get(thirdCard.categoryId) : thirdCard.category}
              face={faces[thirdCard.merchantName || thirdCard.name]}
              flow={flowMoney(thirdCard.amountCents)}
              quick={quick}
              selectedCategoryId={thirdCard.categoryId ?? undefined}
              isInteractive={false}
              palette={palette}
              isDark={isDark}
            />
          </Animated.View>
        ) : null}

        {/* Card 2 (if exists) */}
        {nextCard ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.cardSurface,
              styles.stackedCard,
              {
                width: cardWidth,
                borderTopColor: palette.specularTop,
                borderBottomColor: palette.specularBottom,
                borderLeftColor: palette.specularSides,
                borderRightColor: palette.specularSides,
                backgroundColor: reduceTransparency
                  ? isDark
                    ? "#171a21"
                    : "#ffffff"
                  : palette.glassProminent,
              },
              animatedNextCardStyle,
            ]}
          >
            {!reduceTransparency ? (
              <BlurView
                intensity={isDark ? 50 : 75}
                tint={palette.blurTint}
                style={StyleSheet.absoluteFill}
              />
            ) : null}
            <CardContent
              tx={nextCard}
              currentCategory={nextCard.categoryId ? byId.get(nextCard.categoryId) : nextCard.category}
              face={faces[nextCard.merchantName || nextCard.name]}
              flow={flowMoney(nextCard.amountCents)}
              quick={quick}
              selectedCategoryId={nextCard.categoryId ?? undefined}
              isInteractive={false}
              palette={palette}
              isDark={isDark}
            />
          </Animated.View>
        ) : null}

        {/* Card 1 (Top / Interactive) */}
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
                backgroundColor: reduceTransparency
                  ? isDark
                    ? "#171a21"
                    : "#ffffff"
                  : palette.glassProminent,
              },
              animatedTopCardStyle,
            ]}
          >
            {!reduceTransparency ? (
              <BlurView
                intensity={isDark ? 50 : 75}
                tint={palette.blurTint}
                style={StyleSheet.absoluteFill}
              />
            ) : null}

            {/* Reactive Glow Highlight */}
            <Animated.View pointerEvents="none" style={[styles.glowBorder, animatedGlowStyle]} />

            {/* Reactive Overlay: APPROVE */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.cardOverlay,
                styles.approveOverlay,
                animatedApproveOverlayStyle,
              ]}
            >
              <View style={[styles.overlayPill, styles.approveOverlayPill, isDark && { backgroundColor: "rgba(12, 32, 24, 0.94)" }]}>
                <View style={[styles.overlayIconCircle, { backgroundColor: isDark ? "rgba(16, 185, 129, 0.22)" : "rgba(16, 185, 129, 0.15)" }]}>
                  <Icon name="check" size={20} color="#10b981" />
                </View>
                <Text style={styles.approveOverlayText}>Approved</Text>
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
              <View style={[styles.overlayPill, styles.skipOverlayPill, isDark && { backgroundColor: "rgba(36, 14, 20, 0.94)" }]}>
                <View style={[styles.overlayIconCircle, { backgroundColor: isDark ? "rgba(244, 63, 94, 0.22)" : "rgba(244, 63, 94, 0.15)" }]}>
                  <Icon name="close" size={20} color="#f43f5e" />
                </View>
                <Text style={styles.skipOverlayText}>Skipped</Text>
              </View>
            </Animated.View>

            <CardContent
              tx={current}
              currentCategory={currentCategory}
              face={face}
              flow={flow}
              quick={quick}
              selectedCategoryId={categoryId}
              always={always}
              onAlwaysToggle={() => {
                tapSelect();
                setAlways((v) => !v);
              }}
              onCategoryPress={() => {
                tapPress();
                setPicking(true);
              }}
              onQuickCategorySelect={(id) => {
                tapSelect();
                setCategoryId(id);
              }}
              isInteractive={true}
              palette={palette}
              isDark={isDark}
              similar={similar}
            />
          </Animated.View>
        </GestureDetector>
      </View>

      {/* Cohesive Liquid-Glass Action Dock */}
      <View
        style={[
          styles.actionDock,
          {
            width: cardWidth,
            borderTopColor: palette.specularTop,
            borderBottomColor: palette.specularBottom,
            borderLeftColor: palette.specularSides,
            borderRightColor: palette.specularSides,
            backgroundColor: reduceTransparency
              ? isDark
                ? "#171a21"
                : "#ffffff"
              : palette.dockBg,
          },
        ]}
      >
        {!reduceTransparency ? (
          <BlurView
            intensity={isDark ? 55 : 75}
            tint={palette.blurTint}
            style={StyleSheet.absoluteFill}
          />
        ) : null}

        {/* Left Utility Actions: Undo & Category */}
        <View style={styles.dockUtilityGroup}>
          <Pressable
            accessibilityLabel="Undo last review"
            disabled={!canUndo || busy || isDismissing}
            onPress={() => {
              if (onUndo) onUndo();
            }}
            hitSlop={8}
            style={({ pressed }) => [
              styles.dockIconBtn,
              {
                backgroundColor: isDark ? "rgba(255, 255, 255, 0.06)" : palette.fill,
                borderColor: palette.line,
              },
              (!canUndo || busy || isDismissing) && { opacity: 0.3 },
              pressed && canUndo ? { transform: [{ scale: 0.92 }], opacity: 0.75 } : null,
            ]}
          >
            <Icon name="undo" size={17} color={canUndo ? palette.ink : palette.quaternaryLabel} />
          </Pressable>

          <Pressable
            accessibilityLabel="Choose category"
            disabled={busy || isDismissing}
            onPress={() => {
              tapPress();
              setPicking(true);
            }}
            hitSlop={8}
            style={({ pressed }) => [
              styles.dockIconBtn,
              {
                backgroundColor: isDark ? "rgba(255, 255, 255, 0.06)" : palette.fill,
                borderColor: palette.line,
              },
              (busy || isDismissing) && { opacity: 0.35 },
              pressed ? { transform: [{ scale: 0.92 }], opacity: 0.75 } : null,
            ]}
          >
            <Icon name="tag" size={16} color={palette.ink} />
          </Pressable>
        </View>

        {/* Subtle Divider */}
        <View style={[styles.dockDivider, { backgroundColor: palette.line }]} />

        {/* Right Primary Decision Actions: Skip & Approve */}
        <View style={styles.dockDecisionGroup}>
          {/* Skip Action */}
          <Pressable
            accessibilityLabel="Skip transaction"
            disabled={busy || isDismissing}
            onPress={handleButtonDeny}
            style={({ pressed }) => [
              styles.dockPillBtn,
              styles.dockSkipBtn,
              {
                backgroundColor: isDark ? "rgba(255, 255, 255, 0.06)" : palette.fill,
                borderColor: palette.line,
              },
              (busy || isDismissing) && { opacity: 0.35 },
              pressed ? { transform: [{ scale: 0.96 }], opacity: 0.75 } : null,
            ]}
          >
            <Icon name="close" size={14} color={palette.muted} />
            <Text style={[styles.dockBtnLabel, { color: palette.ink }]}>Skip</Text>
          </Pressable>

          {/* Approve Action */}
          <Pressable
            accessibilityLabel="Approve transaction"
            disabled={busy || isDismissing}
            onPress={handleButtonApprove}
            style={({ pressed }) => [
              styles.dockPillBtn,
              styles.dockApproveBtn,
              {
                backgroundColor: palette.accent,
                borderColor: palette.specularTop,
              },
              (busy || isDismissing) && { opacity: 0.35 },
              pressed ? { transform: [{ scale: 0.96 }], opacity: 0.88 } : null,
            ]}
          >
            <Icon name="check" size={16} color="#ffffff" />
            <Text style={[styles.dockBtnLabel, styles.dockApproveText]}>Approve</Text>
          </Pressable>
        </View>
      </View>

      {/* Category Picker Sheet Modal */}
      {picking ? (
        <Sheet title="Select Category" onClose={() => setPicking(false)}>
          <CategoryPicker
            groups={groups}
            selected={categoryId}
            onSelect={(id) => {
              setCategoryId(id);
              setPicking(false);
            }}
            onClose={() => setPicking(false)}
          />
        </Sheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: "rgba(16, 185, 129, 0.12)",
  },
  skipOverlay: {
    backgroundColor: "rgba(244, 63, 94, 0.12)",
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
  approveOverlayPill: {
    backgroundColor: "#ffffff",
    borderColor: "#10b981",
  },
  skipOverlayPill: {
    backgroundColor: "#ffffff",
    borderColor: "#f43f5e",
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
    fontWeight: "800",
    letterSpacing: 0.4,
    color: "#10b981",
  },
  skipOverlayText: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0.4,
    color: "#f43f5e",
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
});
