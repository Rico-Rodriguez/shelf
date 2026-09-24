import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../src/api";
import { CategoryPicker, Charge, ChargeSheet, getCategoryColor } from "../src/charge";
import { ReviewCard } from "../src/decide";
import { dayLabel, merchantMatchKey, money } from "../src/format";
import { tapCelebration, tapPress, tapSelect } from "../src/haptic";
import { Icon, MerchantMark } from "../src/icons";
import { celebrate, CelebrationBurst, SuccessMark } from "../src/toast";
import { colors, Field, Sheet, Switch } from "../src/ui";

type Group = { name: string; color?: string | null; categories: { id: string; name: string; color?: string | null }[] };

export default function ReviewScreen() {
  const [rows, setRows] = useState<Charge[] | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [always, setAlways] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [picking, setPicking] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    return Promise.all([
      api<{ transactions: Charge[] }>("/api/transactions?reviewed=false"),
      api<{ groups: Group[] }>("/api/categories"),
    ])
      .then(([tx, cats]) => {
        setRows(tx.transactions);
        setGroups(cats.groups);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load review"));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const current = rows?.[0] ?? null;
  const next = rows?.[1] ?? null;
  const categories = useMemo(() => groups.flatMap((group) => group.categories), [groups]);

  // Frequently used / common quick-pick categories for 1-tap switching on the card
  const quickCategories = useMemo(() => {
    const list: { id: string; name: string; color?: string | null }[] = [];
    const seen = new Set<string>();
    for (const group of groups) {
      if (group.name.toLowerCase().includes("income")) continue;
      for (const cat of group.categories) {
        if (!seen.has(cat.id)) {
          seen.add(cat.id);
          list.push({ ...cat, color: getCategoryColor(cat, group) });
          if (list.length >= 4) break;
        }
      }
      if (list.length >= 4) break;
    }
    return list;
  }, [groups]);

  useEffect(() => {
    if (!current) return;
    setCategoryId(current.categoryId ?? "");
    setName(current.merchantName || current.name);
    setAlways(false);
    setRenaming(false);
    setPicking(false);
  }, [current?.id]);

  function skip() {
    tapPress();
    setRows((list) => {
      if (!list || list.length < 2) return list;
      return [...list.slice(1), list[0]];
    });
  }

  useEffect(() => {
    if (rows && rows.length === 0 && reviewedCount > 0) {
      tapCelebration();
    }
  }, [rows?.length, reviewedCount]);

  const currentCategoryObj = categories.find((category) => category.id === categoryId);
  const categoryName = currentCategoryObj?.name ?? "Uncategorized";
  const categoryColor = getCategoryColor(currentCategoryObj);
  const remainingCount = rows?.length ?? 0;

  // When "Always file as" is checked, recursively update the category for all matching charges in the queue
  useEffect(() => {
    if (!always || !categoryId || !current) return;
    const merchant = current.merchantName || name || current.name;
    const matchKey = merchantMatchKey(merchant).toLowerCase();
    if (!matchKey) return;

    setRows((list) => {
      if (!list) return list;
      let changed = false;
      const nextList = list.map((row) => {
        if (row.id === current.id) return row;
        const hay = `${row.merchantName ?? ""} ${row.name} ${row.originalDescription ?? ""}`.toLowerCase();
        if (hay.includes(matchKey) && row.categoryId !== categoryId) {
          changed = true;
          return {
            ...row,
            categoryId,
            category: currentCategoryObj
              ? { name: currentCategoryObj.name, color: currentCategoryObj.color }
              : row.category,
          };
        }
        return row;
      });
      return changed ? nextList : list;
    });
  }, [always, categoryId, current?.id, currentCategoryObj, name]);

  const similarCount = useMemo(() => {
    if (!current) return 0;
    const matchKey = merchantMatchKey(current.merchantName || name || current.name).toLowerCase();
    if (!matchKey) return 0;
    return (rows ?? []).filter((tx) => {
      if (tx.id === current.id) return false;
      const hay = `${tx.merchantName ?? ""} ${tx.name} ${tx.originalDescription ?? ""}`.toLowerCase();
      return hay.includes(matchKey);
    }).length;
  }, [current, name, rows]);

  async function markReviewed() {
    if (!current) return;
    const id = current.id;
    const finalCategoryId = categoryId || null;
    const finalName = name.trim() || current.name;
    const saveAlways = always && Boolean(finalCategoryId);
    const merchant = current.merchantName || finalName;
    const matchKey = merchantMatchKey(merchant).toLowerCase();

    // Find any other unreviewed transactions currently in the queue that match this merchant rule
    const matchingOtherIds = saveAlways
      ? (rows ?? [])
          .filter((tx) => {
            if (tx.id === id) return false;
            const hay = `${tx.merchantName ?? ""} ${tx.name} ${tx.originalDescription ?? ""}`.toLowerCase();
            return hay.includes(matchKey);
          })
          .map((tx) => tx.id)
      : [];

    const clearedTotal = 1 + matchingOtherIds.length;
    const clearedSet = new Set([id, ...matchingOtherIds]);

    if (clearedTotal > 1) {
      celebrate(`Reviewed (+${clearedTotal - 1} cleared)`);
    } else {
      celebrate("Reviewed");
    }

    setReviewedCount((count) => count + clearedTotal);
    // Recursively drop all matching charges from the queue immediately
    setRows((list) => (list ?? []).filter((row) => !clearedSet.has(row.id)));

    try {
      await api(`/api/transactions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ categoryId: finalCategoryId, reviewed: true, name: finalName }),
      });
      if (saveAlways && finalCategoryId) {
        const ruleRes = await api<{ id: string; applied?: number; ids?: string[] }>("/api/rules", {
          method: "POST",
          body: JSON.stringify({
            name: merchant,
            matchMerchant: merchantMatchKey(merchant),
            actionCategoryId: finalCategoryId,
            actionRename: finalName !== current.name ? finalName : undefined,
            enabled: true,
            applyUnreviewed: true,
          }),
        });

        // If the server matched any additional IDs not in our local set, drop them too
        if (ruleRes?.ids?.length) {
          const serverSet = new Set(ruleRes.ids);
          setRows((list) => (list ?? []).filter((row) => !serverSet.has(row.id)));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      void load();
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top", "left", "right", "bottom"]}>
      {/* Top Navigation Bar */}
      <View style={{ minHeight: 48, flexDirection: "row", alignItems: "center", paddingHorizontal: 8 }}>
        <Pressable
          accessibilityLabel="Back"
          onPress={() => router.back()}
          hitSlop={8}
          style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
        >
          <View style={{ transform: [{ rotate: "180deg" }] }}>
            <Icon name="chevron" size={20} color={colors.ink} />
          </View>
        </Pressable>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 17, fontWeight: "600", color: colors.ink, marginRight: 44 }}>
          Review Transactions
        </Text>
      </View>

      {error ? <Text style={{ color: colors.danger, textAlign: "center", paddingHorizontal: 24, marginVertical: 8 }}>{error}</Text> : null}

      {/* Loading state */}
      {rows === null && !error ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: colors.muted, fontSize: 16 }}>Loading review queue…</Text>
        </View>
      ) : null}

      {/* All Done Empty State with Celebratory Confetti Burst */}
      {rows && !current ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 32 }}>
          <CelebrationBurst />
          <SuccessMark />
          <Text style={{ fontSize: 24, fontWeight: "700", letterSpacing: -0.6, color: colors.ink }}>
            You’re all caught up
          </Text>
          <Text style={{ fontSize: 15, color: colors.muted, textAlign: "center", lineHeight: 22 }}>
            Every charge has been verified. New transactions will appear here when they sync.
          </Text>
        </View>
      ) : null}

      {/* Review Card Deck */}
      {current ? (
        <View style={{ flex: 1, paddingHorizontal: 20, paddingBottom: 16 }}>
          <View style={{ flex: 1, justifyContent: "center" }}>
            {/* Realistic Stack Behind Card */}
            {next ? (
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: 14,
                  right: 14,
                  top: 14,
                  bottom: -8,
                  borderRadius: 28,
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.line,
                  opacity: 0.75,
                  transform: [{ scale: 0.94 }, { translateY: 10 }],
                }}
              />
            ) : null}

            {/* Front Interactive Card */}
            <ReviewCard id={current.id} onReviewed={() => void markReviewed()} onSkip={skip}>
              <View
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingHorizontal: 24,
                  paddingVertical: 28,
                }}
              >
                {/* Meta Header */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 5,
                    borderRadius: 999,
                    backgroundColor: colors.fill,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>
                    {current.account?.name ?? "Account"}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.tertiary }}>•</Text>
                  <Text style={{ fontSize: 12, fontWeight: "500", color: colors.muted }}>
                    {dayLabel(current.date)}
                  </Text>
                </View>

                {/* Merchant Avatar and Title */}
                <View style={{ alignItems: "center", gap: 10, width: "100%" }}>
                  <MerchantMark name={name} color={categoryColor} />

                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <Text
                      style={{
                        fontSize: 26,
                        lineHeight: 32,
                        fontWeight: "700",
                        letterSpacing: -0.6,
                        color: colors.ink,
                        textAlign: "center",
                      }}
                      numberOfLines={2}
                    >
                      {name}
                    </Text>
                    <Pressable
                      onPress={() => setRenaming(true)}
                      hitSlop={10}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: colors.fill,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon name="pencil" size={13} color={colors.muted} />
                    </Pressable>
                  </View>

                  {current.originalDescription && current.originalDescription !== name ? (
                    <Text
                      style={{
                        color: colors.tertiary,
                        fontSize: 12,
                        textAlign: "center",
                        paddingHorizontal: 12,
                      }}
                      numberOfLines={1}
                    >
                      Original: {current.originalDescription}
                    </Text>
                  ) : null}
                </View>

                {/* Hero Money Figure */}
                <Text
                  style={{
                    fontSize: 42,
                    fontWeight: "700",
                    letterSpacing: -1.2,
                    color: colors.ink,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {money(Math.abs(current.amountCents))}
                </Text>

                {/* Category & Fast-Action Area */}
                <View style={{ width: "100%", alignItems: "center", gap: 12 }}>
                  {/* Active Category Button (Tappable for full picker) */}
                  <Pressable
                    onPress={() => setPicking(true)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      paddingHorizontal: 18,
                      minHeight: 44,
                      borderRadius: 999,
                      backgroundColor: colors.card,
                      borderWidth: 1.5,
                      borderColor: categoryColor,
                      shadowColor: categoryColor,
                      shadowOpacity: 0.18,
                      shadowRadius: 6,
                      shadowOffset: { width: 0, height: 2 },
                    }}
                  >
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: categoryColor }} />
                    <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "600" }}>{categoryName}</Text>
                    <Icon name="chevron" size={14} color={colors.muted} />
                  </Pressable>

                  {/* 1-Tap Quick Category Switcher Chips */}
                  {quickCategories.length > 0 ? (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6 }}>
                      {quickCategories.map((cat) => {
                        const isCurrent = cat.id === categoryId;
                        return (
                          <Pressable
                            key={cat.id}
                            onPress={() => {
                              tapSelect();
                              setCategoryId(cat.id);
                            }}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 6,
                              paddingHorizontal: 11,
                              paddingVertical: 6,
                              borderRadius: 999,
                              backgroundColor: isCurrent ? colors.accentSoft : colors.fill,
                              borderWidth: 1,
                              borderColor: isCurrent ? colors.accent : "transparent",
                            }}
                          >
                            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: cat.color || colors.muted }} />
                            <Text
                              style={{
                                fontSize: 13,
                                fontWeight: isCurrent ? "700" : "500",
                                color: isCurrent ? colors.accentInk : colors.muted,
                              }}
                            >
                              {cat.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}

                  {/* "Always categorize" Rule Switch Row */}
                  <Pressable
                    onPress={() => {
                      tapSelect();
                      setAlways((v) => !v);
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderRadius: 14,
                      backgroundColor: colors.fill,
                    }}
                  >
                    <View style={{ flex: 1, gap: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.ink }}>
                        Always file as {categoryName}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: always && similarCount > 0 ? colors.accentInk : colors.muted,
                          fontWeight: always && similarCount > 0 ? "600" : "400",
                        }}
                      >
                        {always && similarCount > 0
                          ? `Clears ${similarCount} matching ${similarCount === 1 ? "charge" : "charges"} in queue`
                          : `Auto-rules future charges for ${name}`}
                      </Text>
                    </View>
                    <Switch on={always} />
                  </Pressable>
                </View>
              </View>
            </ReviewCard>
          </View>

          {/* Queue Progress Counter */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingHorizontal: 4 }}>
            <Text style={{ color: colors.tertiary, fontSize: 13, fontWeight: "500" }}>
              {remainingCount} {remainingCount === 1 ? "charge" : "charges"} to review
            </Text>
            {reviewedCount > 0 ? (
              <Text style={{ color: colors.accentInk, fontSize: 13, fontWeight: "600" }}>
                ✓ {reviewedCount} reviewed
              </Text>
            ) : null}
          </View>

          {/* Bottom Action Controls */}
          <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 32, paddingTop: 14 }}>
            <RoundBtn label="Skip" onPress={skip}>
              <Icon name="skip" size={18} color={colors.ink} />
            </RoundBtn>

            <RoundBtn label="Edit" onPress={() => setEditing(true)}>
              <Icon name="pencil" size={18} color={colors.ink} />
            </RoundBtn>

            <RoundBtn label="Reviewed" filled onPress={() => void markReviewed()}>
              <Icon name="check" size={26} color={colors.bg} filled />
            </RoundBtn>
          </View>
        </View>
      ) : null}

      {/* Category Picker Modal Sheet */}
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

      {/* Quick Merchant Rename Sheet */}
      {renaming && current ? (
        <Sheet title="Rename Merchant" onClose={() => setRenaming(false)}>
          <Field label="Merchant or Transaction Name" value={name} onChangeText={setName} />
          <Pressable
            onPress={() => setRenaming(false)}
            style={{
              minHeight: 48,
              borderRadius: 14,
              backgroundColor: colors.control,
              alignItems: "center",
              justifyContent: "center",
              marginTop: 12,
            }}
          >
            <Text style={{ color: colors.controlInk, fontWeight: "600", fontSize: 16 }}>Done</Text>
          </Pressable>
        </Sheet>
      ) : null}

      {/* Full Transaction Edit Sheet */}
      {editing && current ? (
        <ChargeSheet
          tx={{ ...current, categoryId: categoryId || current.categoryId, name }}
          groups={groups}
          onClose={() => setEditing(false)}
          onSaved={(clearedIds) => {
            setEditing(false);
            const clearedSet = new Set(clearedIds && clearedIds.length ? clearedIds : [current.id]);
            setReviewedCount((count) => count + clearedSet.size);
            setRows((list) => (list ?? []).filter((row) => !clearedSet.has(row.id)));
            celebrate(clearedSet.size > 1 ? `Reviewed (+${clearedSet.size - 1} cleared)` : "Reviewed");
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

function RoundBtn({
  label,
  onPress,
  filled,
  children,
}: {
  label: string;
  onPress: () => void;
  filled?: boolean;
  children: React.ReactNode;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Pressable
      onPress={() => {
        tapPress();
        onPress();
      }}
      onPressIn={() =>
        Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, stiffness: 500, damping: 25 }).start()
      }
      onPressOut={() =>
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, stiffness: 500, damping: 25 }).start()
      }
      style={{ alignItems: "center", gap: 6 }}
    >
      <Animated.View
        style={{
          width: filled ? 68 : 54,
          height: filled ? 68 : 54,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: filled ? colors.ink : colors.card,
          borderWidth: 1,
          borderColor: filled ? "transparent" : colors.lineStrong,
          shadowColor: filled ? colors.ink : "#000",
          shadowOpacity: filled ? 0.22 : 0.06,
          shadowRadius: filled ? 10 : 4,
          shadowOffset: { width: 0, height: filled ? 4 : 2 },
          transform: [{ scale }],
        }}
      >
        {children}
      </Animated.View>
      <Text style={{ color: filled ? colors.ink : colors.muted, fontSize: 13, fontWeight: filled ? "600" : "500" }}>
        {label}
      </Text>
    </Pressable>
  );
}
