import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../src/api";
import { Charge, ChargeGroup } from "../src/charge";
import { ReviewDeck } from "../src/decide";
import { tapCelebration, tapPress } from "../src/haptic";
import { Icon } from "../src/icons";
import { pinUnreviewed } from "../src/live-edits";
import { matchingReviewIds, performReview, restoreReviewRows } from "../src/review-flow";
import { ConfirmMark, UndoHost } from "../src/toast";
import { colors, LoadError, Loading } from "../src/ui";

type TxPayload = {
  transactions: Charge[];
  unreviewed: number;
  faces?: Record<string, { monthCents: number; count: number }>;
  frequentCategoryIds?: string[];
};

type UndoAction = {
  tx: Charge;
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
  const [actionError, setActionError] = useState<{ message: string; retry: () => void } | null>(null);
  const [undoHistory, setUndoHistory] = useState<UndoAction[]>([]);
  const patches = useRef(new Map<string, { reviewed: boolean; categoryId: string | null; category: Charge["category"] }>());
  const epoch = useRef(0);

  const load = useCallback(() => {
    const started = epoch.current;
    return Promise.all([
      api<TxPayload>("/api/transactions?reviewed=false"),
      api<{ groups: ChargeGroup[] }>("/api/categories"),
    ])
      .then(([tx, cats]) => {
        if (started !== epoch.current) return;
        const returned = new Set(tx.transactions.map((row) => row.id));
        for (const id of [...patches.current.keys()]) {
          const row = tx.transactions.find((item) => item.id === id);
          if (!returned.has(id) || row?.reviewed) patches.current.delete(id);
        }
        setRows(tx.transactions.filter((row) => !row.reviewed && !patches.current.get(row.id)?.reviewed));
        const pending = [...patches.current.values()].filter((patch) => patch.reviewed).length;
        const nextCount = Math.max(0, tx.unreviewed - pending);
        setUnreviewed(nextCount);
        pinUnreviewed(nextCount);
        setFaces(tx.faces ?? {});
        setFrequentCategoryIds(tx.frequentCategoryIds ?? []);
        setReviewBaseline((curr) => curr ?? tx.unreviewed);
        setGroups(cats.groups);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load review"));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const unreviewedRows = useMemo(() => (rows ?? []).filter((tx) => !tx.reviewed), [rows]);
  const categories = useMemo(() => groups.flatMap((group) => group.categories), [groups]);

  function categoryFace(id: string | null): Charge["category"] {
    if (!id) return null;
    const cat = categories.find((item) => item.id === id);
    return cat ? { name: cat.name, color: cat.color ?? null } : null;
  }

  function shiftCount(delta: number) {
    setUnreviewed((count) => {
      const next = Math.max(0, count + delta);
      pinUnreviewed(next);
      return next;
    });
  }

  function paint(ids: string[], categoryId: string | null, snapshots: Charge[]) {
    const face = categoryFace(categoryId);
    const chosen = new Set(ids);
    for (const id of ids) {
      patches.current.set(id, { reviewed: true, categoryId, category: face });
    }
    setRows((current) => (current ?? []).filter((row) => !chosen.has(row.id)));
    shiftCount(-snapshots.filter((row) => !row.reviewed).length);
  }

  function unpaint(ids: string[], snapshots: Charge[]) {
    for (const id of ids) patches.current.delete(id);
    setRows((current) => restoreReviewRows(current ?? [], snapshots));
    shiftCount(snapshots.filter((row) => !row.reviewed).length);
  }

  function handleConfirm(tx: Charge, nextCategoryId: string | null, makeRule: boolean) {
    const source = rows ?? [];
    const rule = makeRule && Boolean(nextCategoryId);
    const ids = matchingReviewIds(source, tx, rule);
    const snapshots = source.filter((row) => ids.includes(row.id));
    setActionError(null);
    epoch.current += 1;
    performReview({
      tx,
      categoryId: nextCategoryId,
      makeRule: rule,
      ids,
      previous: snapshots.map((row) => ({ id: row.id, categoryId: row.categoryId })),
      label: ids.length > 1 ? `Categorized ${ids.length}` : "Reviewed",
      apply: () => paint(ids, nextCategoryId, snapshots),
      restore: () => {
        epoch.current += 1;
        unpaint(ids, snapshots);
      },
      onFailure: (retry) => {
        setUndoHistory((prev) => prev.filter((item) => item.tx.id !== tx.id));
        setActionError({ message: "Could not save that category.", retry });
      },
      onUndo: (undo) => {
        const undoFn = async () => {
          setUndoHistory((prev) => prev.filter((item) => item.tx.id !== tx.id));
          await undo();
        };
        setUndoHistory((prev) => [{ tx, undoFn }, ...prev]);
        return undoFn;
      },
    });
  }

  function handleSkip(tx: Charge) {
    const undoItem: UndoAction = {
      tx,
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

      {error ? <LoadError message={error} onRetry={() => void load()} /> : null}
      {actionError ? <LoadError message={actionError.message} onRetry={actionError.retry} /> : null}

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

      <UndoHost bottomOffset={100} />
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
    paddingBottom: 24,
  },
});
