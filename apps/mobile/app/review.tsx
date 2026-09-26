import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../src/api";
import { Charge, ChargeGroup } from "../src/charge";
import { ReviewDeck } from "../src/decide";
import { merchantMatchKey } from "../src/format";
import { tapCelebration, tapPress } from "../src/haptic";
import { Icon } from "../src/icons";
import { ConfirmMark, offerUndo, UndoHost } from "../src/toast";
import { colors, Loading } from "../src/ui";

type TxPayload = {
  transactions: Charge[];
  unreviewed: number;
  faces?: Record<string, { monthCents: number; count: number }>;
  frequentCategoryIds?: string[];
};

type UndoAction = {
  tx: Charge;
  label: string;
  appliedIds: string[];
  previousEntries: { id: string; categoryId: string | null }[];
  createdRuleId: string | null;
  undoFn: () => Promise<void>;
};

export default function ReviewScreen() {
  const [rows, setRows] = useState<Charge[] | null>(null);
  const [groups, setGroups] = useState<ChargeGroup[]>([]);
  const [faces, setFaces] = useState<Record<string, { monthCents: number; count: number }>>({});
  const [frequentCategoryIds, setFrequentCategoryIds] = useState<string[]>([]);
  const [reviewBaseline, setReviewBaseline] = useState<number | null>(null);
  const [unreviewed, setUnreviewed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [undoHistory, setUndoHistory] = useState<UndoAction[]>([]);
  const cleared = useRef(new Set<string>());

  const load = useCallback(() => {
    return Promise.all([
      api<TxPayload>("/api/transactions?reviewed=false"),
      api<{ groups: ChargeGroup[] }>("/api/categories"),
    ])
      .then(([tx, cats]) => {
        setRows(tx.transactions.filter((t) => !cleared.current.has(t.id)));
        setUnreviewed(tx.unreviewed);
        setFaces(tx.faces ?? {});
        setFrequentCategoryIds(tx.frequentCategoryIds ?? []);
        setReviewBaseline((curr) => curr ?? tx.unreviewed);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load review"));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const unreviewedRows = useMemo(() => (rows ?? []).filter((tx) => !tx.reviewed), [rows]);

  function dropFromQueue(ids: string[]) {
    for (const id of ids) cleared.current.add(id);
    const gone = new Set(ids);
    setRows((current) => (current ? current.filter((r) => !gone.has(r.id)) : []));
    setUnreviewed((count) => Math.max(0, count - ids.length));
  }

  function restoreCleared(ids: string[]) {
    for (const id of ids) cleared.current.delete(id);
  }

  async function handleConfirm(tx: Charge, nextCategoryId: string | null, makeRule: boolean) {
    dropFromQueue([tx.id]);
    let appliedCount = 0;
    let appliedIds: string[] = [];
    let previousEntries: { id: string; categoryId: string | null }[] = [];
    let createdRuleId: string | null = null;

    try {
      await api(`/api/transactions/${tx.id}`, {
        method: "PATCH",
        body: JSON.stringify({ categoryId: nextCategoryId, reviewed: true }),
      });

      if (makeRule && nextCategoryId) {
        const merchant = tx.merchantName || tx.name;
        const res = await api<{ id: string; applied?: number; ids?: string[]; previous?: { id: string; categoryId: string | null }[] }>("/api/rules", {
          method: "POST",
          body: JSON.stringify({
            name: merchant,
            matchMerchant: merchantMatchKey(merchant),
            actionCategoryId: nextCategoryId,
            enabled: true,
            applyUnreviewed: true,
          }),
        });
        if (res) {
          createdRuleId = res.id;
          appliedCount = res.applied ?? 0;
          appliedIds = (res.ids ?? []).filter((id) => id !== tx.id);
          previousEntries = res.previous ?? [];
          dropFromQueue(appliedIds);
        }
      }

      const undoFn = async () => {
        restoreCleared([tx.id, ...appliedIds]);
        await api(`/api/transactions/${tx.id}`, {
          method: "PATCH",
          body: JSON.stringify({ categoryId: tx.categoryId, reviewed: false }),
        });
        if (previousEntries.length > 0) {
          await api("/api/transactions/review-all", {
            method: "POST",
            body: JSON.stringify({ restore: previousEntries }),
          });
        }
        if (createdRuleId) {
          await api(`/api/rules/${createdRuleId}`, { method: "DELETE" });
        }
        setRows((current) => (current ? [tx, ...current] : [tx]));
        setUnreviewed((count) => count + 1 + appliedIds.length);
      };

      const undoItem: UndoAction = {
        tx,
        label: appliedCount > 0 ? `Categorized ${appliedCount + 1}` : "Reviewed",
        appliedIds,
        previousEntries,
        createdRuleId,
        undoFn,
      };

      setUndoHistory((prev) => [undoItem, ...prev]);

      offerUndo(undoItem.label, async () => {
        await undoFn();
        setUndoHistory((prev) => prev.filter((item) => item.tx.id !== tx.id));
      });
    } catch {
      load();
    }
  }

  function handleSkip(tx: Charge) {
    const undoItem: UndoAction = {
      tx,
      label: "Skipped",
      appliedIds: [],
      previousEntries: [],
      createdRuleId: null,
      undoFn: async () => {
        setRows((current) => {
          if (!current) return [tx];
          const without = current.filter((r) => r.id !== tx.id);
          return [tx, ...without];
        });
      },
    };

    setUndoHistory((prev) => [undoItem, ...prev]);

    setRows((current) => {
      if (!current || current.length < 2) return current;
      const index = current.findIndex((r) => r.id === tx.id);
      if (index < 0) return current;
      const next = current.slice();
      const [skipped] = next.splice(index, 1);
      next.push(skipped);
      return next;
    });
  }

  const handleUndo = useCallback(async () => {
    if (undoHistory.length === 0) return;
    const [last, ...rest] = undoHistory;
    setUndoHistory(rest);
    tapCelebration();
    await last.undoFn();
  }, [undoHistory]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
      {/* Top Header */}
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Back"
          onPress={() => {
            tapPress();
            router.back();
          }}
          hitSlop={8}
          style={styles.backButton}
        >
          <View style={{ transform: [{ rotate: "180deg" }] }}>
            <Icon name="chevron" size={20} color={colors.ink} />
          </View>
        </Pressable>

        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Review</Text>
          {unreviewed > 0 ? (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{unreviewed}</Text>
            </View>
          ) : null}
        </View>

        <Pressable
          onPress={() => {
            tapPress();
            router.back();
          }}
          hitSlop={8}
          style={styles.doneButton}
        >
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>

      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : null}

      {/* Loading state */}
      {rows === null && !error ? (
        <View style={styles.centerContainer}>
          <Loading />
        </View>
      ) : null}

      {/* All caught up empty state */}
      {rows !== null && unreviewedRows.length === 0 ? (
        <View style={styles.emptyContainer}>
          <ConfirmMark size={68} />
          <Text style={styles.emptyTitle}>You’re caught up</Text>
          <Text style={styles.emptySubtitle}>
            Every transaction has been reviewed.
          </Text>
          {undoHistory.length > 0 ? (
            <Pressable onPress={handleUndo} style={styles.undoCaughtUpButton}>
              <Icon name="undo" size={16} color={colors.accentInk} />
              <Text style={styles.undoCaughtUpText}>Undo last review</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => {
              tapPress();
              router.back();
            }}
            style={styles.emptyButton}
          >
            <Text style={styles.emptyButtonText}>Show all activity</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Review Deck */}
      {rows !== null && unreviewedRows.length > 0 ? (
        <View style={styles.deckContainer}>
          <ReviewDeck
            rows={unreviewedRows}
            remaining={unreviewed}
            total={reviewBaseline ?? unreviewed}
            groups={groups}
            frequentCategoryIds={frequentCategoryIds}
            faces={faces}
            onConfirm={handleConfirm}
            onSkip={handleSkip}
            onUndo={handleUndo}
            canUndo={undoHistory.length > 0}
          />
        </View>
      ) : null}

      <UndoHost />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.2,
  },
  headerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
    backgroundColor: colors.fill,
  },
  headerBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
  },
  doneButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  doneText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.accentInk,
  },
  errorText: {
    color: colors.danger,
    textAlign: "center",
    paddingHorizontal: 20,
    marginVertical: 12,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingHorizontal: 32,
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
    marginTop: 4,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 99,
    backgroundColor: colors.fill,
  },
  undoCaughtUpText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.accentInk,
  },
  emptyButton: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  emptyButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.accentInk,
  },
  deckContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
});
