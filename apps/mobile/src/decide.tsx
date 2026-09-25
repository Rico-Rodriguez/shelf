import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { api } from "./api";
import { CategoryPicker, Charge, ChargeGroup, getCategoryColor } from "./charge";
import { dayLabel, flowMoney, merchantMatchKey, money } from "./format";
import { tapPress, tapSelect, tapSuccess } from "./haptic";
import { Icon, MerchantMark } from "./icons";
import { useTheme } from "./theme";
import { ConfirmMark } from "./toast";
import { colors, Sheet, Switch } from "./ui";

export type { ChargeGroup };

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

export function ReviewDeck({
  rows,
  remaining,
  total,
  groups,
  frequentCategoryIds = [],
  faces = {},
  onConfirm,
  onSkip,
}: {
  rows: Charge[];
  remaining: number;
  total: number;
  groups: ChargeGroup[];
  frequentCategoryIds?: string[];
  faces?: Record<string, { monthCents: number; count: number }>;
  onConfirm: (tx: Charge, categoryId: string | null, always: boolean) => Promise<void>;
  onSkip: (tx: Charge) => void;
}) {
  const current = rows[0];
  const [visible, setVisible] = useState<Charge | undefined>(current);
  const [leaving, setLeaving] = useState(false);
  const [categoryId, setCategoryId] = useState(current?.categoryId ?? "");
  const [always, setAlways] = useState(false);
  const [busy, setBusy] = useState(false);
  const [burst, setBurst] = useState(false);
  const [picking, setPicking] = useState(false);
  const burstLock = useRef(false);
  const [similar, setSimilar] = useState<number | null>(null);

  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const currentRef = useRef(current);
  currentRef.current = current;
  const currentId = current?.id ?? null;

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
    return rankCategories(pool, frequentCategoryIds)
      .map((id) => byId.get(id))
      .filter((cat): cat is { id: string; name: string; color?: string | null } => Boolean(cat));
  }, [pool, frequentCategoryIds, byId]);

  const merchant = visible ? visible.merchantName || visible.name : "";
  const face = visible ? faces[visible.merchantName || visible.name] : undefined;
  const done = total > 0 ? Math.max(0, total - remaining) : 0;
  const progress = total > 0 ? Math.max(0, Math.min(100, (done / total) * 100)) : 0;

  useEffect(() => {
    const next = currentRef.current;
    const previous = visibleRef.current;
    if (previous?.id === next?.id) return;
    setLeaving(true);
    const timer = setTimeout(() => {
      setVisible(next);
      setLeaving(false);
      setBurst(false);
      burstLock.current = false;
      setCategoryId(next?.categoryId ?? "");
      setAlways(false);
      setSimilar(null);
      setBusy(false);
    }, 150);
    return () => clearTimeout(timer);
  }, [currentId]);

  useEffect(() => {
    if (!always || !visible) {
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
        excludeId: visible.id,
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
  }, [always, merchant, visible]);

  if (!visible) return null;

  const currentCategory = categoryId ? byId.get(categoryId) : visible.category;
  const flow = flowMoney(visible.amountCents);

  function confirm() {
    if (!visible || busy || leaving || burstLock.current) return;
    burstLock.current = true;
    tapSuccess();
    setBurst(true);
    const run = () => {
      if (!visibleRef.current) return;
      setBusy(true);
      void onConfirm(visibleRef.current, categoryId || null, always && Boolean(categoryId)).finally(() => setBusy(false));
    };
    setTimeout(run, 400);
  }

  const { palette } = useTheme();
  const isDark = palette.scheme === "dark";

  return (
    <View
      style={[
        styles.panel,
        leaving && { opacity: 0.6 },
      ]}
    >
      <BlurView
        intensity={isDark ? 50 : 70}
        tint={palette.blurTint}
        style={StyleSheet.absoluteFill}
      />
      {burst ? (
        <View style={styles.burstOverlay}>
          <ConfirmMark size={72} />
        </View>
      ) : null}

      {/* Progress meter */}
      <View style={styles.meterContainer}>
        <View style={[styles.meterFill, { width: `${progress}%` }]} />
      </View>

      {/* Queue position & transaction context */}
      <Text style={styles.metaSubtitle}>
        {remaining} left
        {total > remaining ? ` · ${done} done` : ""}
        {" · "}
        {dayLabel(visible.date)}
        {visible.account?.name ? ` · ${visible.account.name}` : ""}
        {visible.pending ? " · Pending" : ""}
      </Text>

      {/* Merchant avatar & info */}
      <View style={styles.merchantRow}>
        <MerchantMark name={merchant} color={currentCategory?.color ?? undefined} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={styles.merchantName}>
            {visible.name}
          </Text>
          <Text numberOfLines={1} style={styles.categorySub}>
            {currentCategory?.name ?? "Uncategorized"}
            {face && face.monthCents > 0 ? ` · ${money(face.monthCents)} this month` : ""}
          </Text>
        </View>
      </View>

      {/* Big Flow Amount */}
      <Text style={[styles.heroAmount, { color: flow.color }]}>
        {flow.text}
      </Text>

      {/* Quick Category Chips (1..6) */}
      <View style={styles.chipGrid}>
        {quick.map((category, index) => {
          const isSelected = categoryId === category.id;
          return (
            <Pressable
              key={category.id}
              onPress={() => {
                tapSelect();
                setCategoryId(category.id);
              }}
              style={[styles.chip, isSelected && styles.chipSelected]}
            >
              <Text style={[styles.chipNumber, isSelected && styles.chipNumberSelected]}>
                {index + 1}
              </Text>
              <Text style={[styles.chipLabel, isSelected && styles.chipLabelSelected]}>
                {category.name}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Choose Category Picker Button */}
      <Pressable
        onPress={() => {
          tapPress();
          setPicking(true);
        }}
        style={styles.pickerButton}
      >
        <Text style={[styles.pickerButtonText, !currentCategory && { color: colors.muted }]}>
          {currentCategory?.name ?? "Choose a category"}
        </Text>
        <Icon name="chevron" size={16} color={colors.muted} />
      </Pressable>

      {/* Always categorize switch row */}
      <Pressable
        onPress={() => {
          tapSelect();
          setAlways((v) => !v);
        }}
        style={styles.switchRow}
      >
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={styles.switchTitle}>
            Always categorize {merchant} this way
          </Text>
          {always && similar != null && similar > 0 ? (
            <Text style={styles.switchSubtitle}>
              Clears {similar} more
            </Text>
          ) : null}
        </View>
        <Switch on={always} />
      </Pressable>

      {/* Action Buttons: Skip & Confirm */}
      <View style={styles.actionsRow}>
        <Pressable
          onPress={() => {
            tapPress();
            onSkip(visible);
          }}
          disabled={busy || leaving || burst}
          style={styles.skipButton}
        >
          <Text style={styles.skipButtonText}>Skip</Text>
        </Pressable>

        <Pressable
          onPress={confirm}
          disabled={busy || leaving || burst}
          style={styles.confirmButton}
        >
          <Text style={styles.confirmButtonText}>
            {busy ? "Saving…" : "Confirm"}
          </Text>
        </Pressable>
      </View>

      {/* Category Picker Sheet */}
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
  panel: {
    backgroundColor: colors.glassProminent,
    borderRadius: 24,
    borderCurve: "continuous",
    borderWidth: 1,
    borderTopColor: colors.glassBorder,
    borderBottomColor: colors.glassBorderSubtle,
    borderLeftColor: colors.glassBorderSubtle,
    borderRightColor: colors.glassBorderSubtle,
    padding: 20,
    gap: 14,
    position: "relative",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  burstOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.88)",
    borderRadius: 24,
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
  metaSubtitle: {
    fontSize: 13,
    color: colors.muted,
    letterSpacing: -0.1,
  },
  merchantRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  merchantName: {
    fontSize: 20,
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
  heroAmount: {
    fontSize: 38,
    fontWeight: "700",
    letterSpacing: -1.2,
    fontVariant: ["tabular-nums"],
    paddingVertical: 2,
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 999,
    borderCurve: "continuous",
    backgroundColor: colors.fill,
    borderWidth: 1,
    borderColor: "transparent",
  },
  chipSelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  chipNumber: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.tertiary,
    fontVariant: ["tabular-nums"],
  },
  chipNumberSelected: {
    color: colors.accentInk,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.ink,
  },
  chipLabelSelected: {
    fontWeight: "700",
    color: colors.accentInk,
  },
  pickerButton: {
    minHeight: 48,
    borderRadius: 14,
    borderCurve: "continuous",
    backgroundColor: colors.fill,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  pickerButtonText: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.ink,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.fill,
    borderRadius: 14,
    borderCurve: "continuous",
  },
  switchTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.ink,
  },
  switchSubtitle: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  skipButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderCurve: "continuous",
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderTopColor: colors.glassBorder,
    borderBottomColor: colors.glassBorderSubtle,
    borderLeftColor: colors.glassBorderSubtle,
    borderRightColor: colors.glassBorderSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  skipButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.ink,
  },
  confirmButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderCurve: "continuous",
    backgroundColor: colors.control,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  confirmButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.controlInk,
  },
});
