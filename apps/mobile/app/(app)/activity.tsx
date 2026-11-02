import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { api, load as read, peek } from "../../src/api";
import { Charge, ChargeGroup, ChargeSheet } from "../../src/charge";
import { ReviewDeck } from "../../src/decide";
import { dayLabel, flowMoney, monthLabel, monthRange, todayISO } from "../../src/format";
import { tapCelebration, tapPress, tapSelect } from "../../src/haptic";
import { Icon, MerchantMark } from "../../src/icons";
import { dropQuickLog, mergeActivityRows, pinUnreviewed, settleQuickLog, stageQuickLog, subscribeLive, type QuickLog } from "../../src/live-edits";
import { matchingReviewIds, performReview, restoreReviewRows, runUndoable } from "../../src/review-flow";
import { ConfirmMark, dismissUndo, offerUndo, UndoHost } from "../../src/toast";
import { SwipeRow } from "../../src/swipe";
import {
  Button,
  Card,
  colors,
  Field,
  GlassButton,
  LoadError,
  Loading,
  MonthNav,
  Note,
  ReviewBanner,
  Screen,
  SearchField,
  Section,
  Segment,
  Sheet,
} from "../../src/ui";
import { useReduceTransparency, useTheme, type Palette } from "../../src/theme";

type Tx = Charge;
type TxPayload = {
  transactions: Tx[];
  unreviewed: number;
  faces?: Record<string, { monthCents: number; count: number }>;
  frequentCategoryIds?: string[];
};

function txPath(
  search: string,
  unreviewedOnly: boolean,
  categoryId: string,
  accountFilter: string,
  tag: string,
  range: { start: string; end: string } | null,
) {
  const qs = new URLSearchParams();
  if (search.trim()) qs.set("q", search.trim());
  if (unreviewedOnly) qs.set("reviewed", "false");
  if (categoryId) qs.set("categoryId", categoryId);
  if (accountFilter) qs.set("accountId", accountFilter);
  if (tag.trim()) qs.set("tag", tag.trim());
  if (range) {
    qs.set("start", range.start);
    qs.set("end", range.end);
  }
  return `/api/transactions?${qs.toString()}`;
}

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const reduceTransparency = useReduceTransparency();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const params = useLocalSearchParams<{
    q?: string;
    categoryId?: string;
    start?: string;
    end?: string;
    accountId?: string;
    tag?: string;
    reviewed?: string;
    focus?: string;
  }>();

  const [focusMode, setFocusMode] = useState(params.focus === "1" && params.reviewed === "false");
  const [query, setQuery] = useState(typeof params.q === "string" ? params.q : "");
  const [search, setSearch] = useState(query);
  const [unreviewedOnly, setUnreviewedOnly] = useState(params.reviewed === "false");
  const [categoryId, setCategoryId] = useState(typeof params.categoryId === "string" ? params.categoryId : "");
  const [accountFilter, setAccountFilter] = useState(typeof params.accountId === "string" ? params.accountId : "");
  const [tag, setTag] = useState(typeof params.tag === "string" ? params.tag : "");
  const [range, setRange] = useState<{ start: string; end: string } | null>(
    typeof params.start === "string" && typeof params.end === "string" ? { start: params.start, end: params.end } : null,
  );

  const [rows, setRows] = useState<Tx[] | null>(() => {
    const start = typeof params.start === "string" && typeof params.end === "string" ? { start: params.start, end: params.end } : null;
    return (
      peek<TxPayload>(
        txPath(
          typeof params.q === "string" ? params.q : "",
          params.reviewed === "false",
          typeof params.categoryId === "string" ? params.categoryId : "",
          typeof params.accountId === "string" ? params.accountId : "",
          typeof params.tag === "string" ? params.tag : "",
          start,
        ),
      )?.transactions ?? null
    );
  });
  const [unreviewed, setUnreviewed] = useState(0);
  const [reviewBaseline, setReviewBaseline] = useState<number | null>(null);
  const [faces, setFaces] = useState<Record<string, { monthCents: number; count: number }>>({});
  const [frequentCategoryIds, setFrequentCategoryIds] = useState<string[]>([]);
  const [groups, setGroups] = useState<ChargeGroup[]>(() => peek<{ groups: ChargeGroup[] }>("/api/categories")?.groups ?? []);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>(() => peek<{ accounts: { id: string; name: string }[] }>("/api/accounts")?.accounts ?? []);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Tx | null>(null);
  const [filters, setFilters] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [income, setIncome] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkCategory, setBulkCategory] = useState("");
  const [addCategory, setAddCategory] = useState("");
  const [addDate, setAddDate] = useState(todayISO());
  const [addMore, setAddMore] = useState(false);
  const [reviewUndoHistory, setReviewUndoHistory] = useState<{ tx: Charge; undoFn: () => Promise<void> }[]>([]);
  const [actionError, setActionError] = useState<{ message: string; retry: () => void } | null>(null);
  const [liveTick, setLiveTick] = useState(0);
  const patches = useRef(new Map<string, Partial<Tx>>());
  const reviewEpoch = useRef(0);
  const sheetEdit = useRef<{ before: Tx; ids: string[]; snapshots: Tx[]; categoryId: string | null; hidden: boolean } | null>(null);

  useEffect(() => {
    if (params.focus === "1" && params.reviewed === "false") {
      setFocusMode(true);
      setUnreviewedOnly(true);
    }
  }, [params.focus, params.reviewed]);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(() => {
    const started = reviewEpoch.current;
    return Promise.all([
      read<TxPayload>(txPath(search, unreviewedOnly, categoryId, accountFilter, tag, range)),
      read<{ groups: ChargeGroup[] }>("/api/categories"),
      read<{ accounts: { id: string; name: string }[] }>("/api/accounts"),
    ])
      .then(([tx, cats, accts]) => {
        if (started !== reviewEpoch.current) return;
        for (const row of tx.transactions) {
          const patch = patches.current.get(row.id);
          if (!patch) continue;
          const agreed =
            (patch.reviewed === undefined || patch.reviewed === row.reviewed) &&
            (patch.categoryId === undefined || patch.categoryId === row.categoryId) &&
            (patch.hidden === undefined || patch.hidden === row.hidden);
          if (agreed) patches.current.delete(row.id);
        }
        setRows(
          tx.transactions.flatMap((row) => {
            const patch = patches.current.get(row.id);
            const next = patch ? ({ ...row, ...patch } as Tx) : row;
            if (next.hidden) return [];
            if (unreviewedOnly && next.reviewed) return [];
            return [next];
          }),
        );
        const pending = [...patches.current.values()].filter((patch) => patch.reviewed && !patch.hidden).length;
        const nextCount = Math.max(0, tx.unreviewed - pending);
        setUnreviewed(nextCount);
        pinUnreviewed(nextCount);
        setReviewBaseline((curr) => curr ?? tx.unreviewed);
        setFaces(tx.faces ?? {});
        setFrequentCategoryIds(tx.frequentCategoryIds ?? []);
        setGroups(cats.groups);
        setAccounts(accts.accounts);
        setAccountId((current) => current || accts.accounts[0]?.id || "");
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load activity"));
  }, [search, unreviewedOnly, categoryId, accountFilter, tag, range]);

  useEffect(() => subscribeLive(() => setLiveTick((value) => value + 1)), []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const shown = useMemo(
    () =>
      mergeActivityRows(rows, {
        unreviewedOnly,
        search,
        categoryId,
        accountId: accountFilter,
        tag,
        range,
      }),
    [rows, liveTick, unreviewedOnly, search, categoryId, accountFilter, tag, range],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Tx[]>();
    for (const tx of shown ?? []) {
      const list = map.get(tx.date) ?? [];
      list.push(tx);
      map.set(tx.date, list);
    }
    return [...map.entries()];
  }, [shown]);

  const unreviewedRows = useMemo(() => (shown ?? []).filter((tx) => !tx.reviewed), [shown]);
  const categories = useMemo(() => groups.flatMap((group) => group.categories), [groups]);

  function categoryFace(id: string | null) {
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

  function paintReviewed(ids: string[], nextCategoryId: string | null, snapshots: Tx[], keepCategory = false) {
    const face = keepCategory ? null : categoryFace(nextCategoryId);
    const chosen = new Set(ids);
    for (const id of ids) {
      const row = snapshots.find((item) => item.id === id);
      const categoryId = keepCategory ? (row?.categoryId ?? null) : nextCategoryId;
      patches.current.set(id, {
        reviewed: true,
        categoryId,
        category: face ? { name: face.name, color: face.color ?? null } : row?.category ?? null,
      });
    }
    setRows((current) =>
      (current ?? []).flatMap((row) => {
        if (!chosen.has(row.id)) return [row];
        const patch = patches.current.get(row.id);
        const next = patch ? ({ ...row, ...patch } as Tx) : { ...row, reviewed: true };
        return unreviewedOnly ? [] : [next];
      }),
    );
    shiftCount(-snapshots.filter((row) => !row.reviewed).length);
  }

  function unpaintReviewed(ids: string[], snapshots: Tx[]) {
    for (const id of ids) patches.current.delete(id);
    setRows((current) => restoreReviewRows(current ?? [], snapshots));
    shiftCount(snapshots.filter((row) => !row.reviewed).length);
  }

  function handleReviewConfirm(tx: Charge, nextCategoryId: string | null, makeRule: boolean) {
    const source = rows ?? [];
    const rule = makeRule && Boolean(nextCategoryId);
    const ids = matchingReviewIds(source, tx, rule);
    const snapshots = source.filter((row) => ids.includes(row.id));
    setActionError(null);
    reviewEpoch.current += 1;
    performReview({
      tx,
      categoryId: nextCategoryId,
      makeRule: rule,
      ids,
      previous: snapshots.map((row) => ({ id: row.id, categoryId: row.categoryId })),
      label: ids.length > 1 ? `Categorized ${ids.length}` : "Reviewed",
      apply: () => paintReviewed(ids, nextCategoryId, snapshots),
      restore: () => {
        reviewEpoch.current += 1;
        unpaintReviewed(ids, snapshots);
      },
      onFailure: (retry) => {
        setReviewUndoHistory((prev) => prev.filter((item) => item.tx.id !== tx.id));
        setActionError({ message: "Could not save that category.", retry });
      },
      onUndo: (undo) => {
        const undoFn = async () => {
          setReviewUndoHistory((prev) => prev.filter((item) => item.tx.id !== tx.id));
          await undo();
        };
        setReviewUndoHistory((prev) => [{ tx, undoFn }, ...prev]);
        return undoFn;
      },
    });
  }

  function handleReviewSkip(tx: Charge) {
    const undoFn = async () => {
      setRows((current) => {
        if (!current) return [tx];
        const without = current.filter((r) => r.id !== tx.id);
        return [tx, ...without];
      });
    };
    setReviewUndoHistory((prev) => [{ tx, undoFn }, ...prev]);

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

  const handleReviewUndo = useCallback(async () => {
    if (reviewUndoHistory.length === 0) return;
    const [last, ...rest] = reviewUndoHistory;
    setReviewUndoHistory(rest);
    tapCelebration();
    await last.undoFn();
  }, [reviewUndoHistory]);

  function hideTx(id: string) {
    const snapshot = (rows ?? []).find((tx) => tx.id === id);
    if (!snapshot) return;
    const wasOpen = !snapshot.reviewed;
    let undone = false;
    setActionError(null);
    reviewEpoch.current += 1;
    const apply = () => {
      patches.current.set(id, { ...patches.current.get(id), hidden: true });
      setRows((current) => (current ?? []).filter((row) => row.id !== id));
      if (wasOpen) shiftCount(-1);
    };
    const restore = () => {
      reviewEpoch.current += 1;
      patches.current.delete(id);
      setRows((current) => restoreReviewRows(current ?? [], [snapshot]));
      if (wasOpen) shiftCount(1);
    };
    apply();
    const hideRequest = api(`/api/transactions/${id}`, { method: "PATCH", body: JSON.stringify({ hidden: true }) });
    offerUndo("Hidden", async () => {
      undone = true;
      restore();
      try {
        await hideRequest;
      } catch {
        return;
      }
      try {
        await api(`/api/transactions/${id}`, { method: "PATCH", body: JSON.stringify({ hidden: false }) });
      } catch {
        apply();
        setActionError({ message: "Could not undo hiding that transaction.", retry: () => hideTx(id) });
      }
    });
    void hideRequest.catch(() => {
      if (undone) return;
      dismissUndo();
      restore();
      setActionError({ message: "Could not hide that transaction.", retry: () => hideTx(id) });
    });
  }

  function markDone(id: string) {
    const tx = (rows ?? []).find((row) => row.id === id);
    if (!tx) return;
    handleReviewConfirm(tx, tx.categoryId, false);
  }

  function add() {
    const dollars = Number(amount);
    if (!name.trim() || !Number.isFinite(dollars) || dollars === 0 || !accountId) {
      setActionError({ message: "Add a name, amount, and account.", retry: () => add() });
      return;
    }
    const cents = Math.round(Math.abs(dollars) * 100);
    const cat = categories.find((item) => item.id === addCategory);
    const acct = accounts.find((item) => item.id === accountId);
    const draft = { name: name.trim(), amount, income, accountId, addCategory, addDate: addDate || todayISO() };
    const log: QuickLog = {
      tempId: `tmp-${Date.now()}`,
      name: draft.name,
      amountCents: draft.income ? -cents : cents,
      date: draft.addDate,
      categoryId: draft.addCategory || null,
      categoryName: cat?.name ?? null,
      categoryColor: cat?.color ?? null,
      accountId: draft.accountId,
      accountName: acct?.name ?? "",
      amount: draft.amount,
      merchant: draft.name,
      isIncome: draft.income,
    };
    let cancelled = false;
    stageQuickLog(log);
    setName("");
    setAmount("");
    setAdding(false);
    setActionError(null);
    const settle = api<{ id: string }>("/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        accountId: log.accountId,
        name: log.name,
        amount: draft.income ? -Math.abs(dollars) : Math.abs(dollars),
        date: log.date,
        categoryId: log.categoryId || undefined,
      }),
    });
    offerUndo("Added", async () => {
      cancelled = true;
      dropQuickLog(log.tempId);
      try {
        const created = await settle;
        await api(`/api/transactions/${created.id}`, { method: "DELETE" });
        void load();
      } catch {
        // The add never landed, so the row is already gone.
      }
    });
    void settle
      .then(async () => {
        if (cancelled) return;
        await load();
        settleQuickLog(log);
      })
      .catch(() => {
        if (cancelled) return;
        dropQuickLog(log.tempId);
        dismissUndo();
        setName(draft.name);
        setAmount(draft.amount);
        setIncome(draft.income);
        setAccountId(draft.accountId);
        setAddCategory(draft.addCategory);
        setAddDate(draft.addDate);
        setAdding(true);
        setActionError({ message: "Could not add that transaction.", retry: () => add() });
      });
  }

  const month = range ? { year: Number(range.start.slice(0, 4)), month: Number(range.start.slice(5, 7)) } : null;
  const filtered = Boolean(search || accountFilter || categoryId || tag || range || unreviewedOnly);
  const accountName = accounts.find((a) => a.id === accountFilter)?.name;
  const categoryName = categories.find((c) => c.id === categoryId)?.name;

  const [refreshing, setRefreshing] = useState(false);
  const pull = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  type ListItem =
    | { type: "header"; id: string; title: string; flowText: string }
    | { type: "tx"; id: string; tx: Tx; isFirst: boolean; isLast: boolean };

  const flatData = useMemo<ListItem[]>(() => {
    const list: ListItem[] = [];
    for (const [date, items] of grouped) {
      const dayNet = items.reduce((sum, tx) => sum + tx.amountCents, 0);
      const flow = flowMoney(dayNet);
      list.push({
        type: "header",
        id: `head-${date}`,
        title: dayLabel(date),
        flowText: flow.text,
      });
      items.forEach((tx, idx) => {
        list.push({
          type: "tx",
          id: tx.id,
          tx,
          isFirst: idx === 0,
          isLast: idx === items.length - 1,
        });
      });
    }
    return list;
  }, [grouped]);

  // Review mode view (when focused into review deck)
  if (focusMode && unreviewedOnly) {
    return (
      <Screen
        title="Review"
        framed
        scrollable={false}
        action={
          <GlassButton
            label="Done"
            onPress={() => {
              tapPress();
              setFocusMode(false);
              setUnreviewedOnly(false);
            }}
            compact
            tone="accent"
          />
        }
      >
        <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8, paddingBottom: Math.max(insets.bottom + 84, 102) }}>
          {actionError ? <LoadError message={actionError.message} onRetry={actionError.retry} /> : null}
          {unreviewedRows.length > 0 ? (
            <ReviewDeck
              rows={unreviewedRows}
              remaining={unreviewed}
              total={reviewBaseline ?? unreviewed}
              groups={groups}
              frequentCategoryIds={frequentCategoryIds}
              faces={faces}
              onConfirm={handleReviewConfirm}
              onSkip={handleReviewSkip}
              onUndo={handleReviewUndo}
              canUndo={reviewUndoHistory.length > 0}
            />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32 }}>
              <ConfirmMark size={68} />
              <Text style={{ fontSize: 22, fontWeight: "700", letterSpacing: -0.5, color: colors.ink }}>
                You’re caught up
              </Text>
              <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center", lineHeight: 20 }}>
                Every transaction has been reviewed.
              </Text>
              {reviewUndoHistory.length > 0 ? (
                <Pressable
                  onPress={handleReviewUndo}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    marginTop: 4,
                    paddingVertical: 8,
                    paddingHorizontal: 14,
                    borderRadius: 99,
                    backgroundColor: colors.fill,
                  }}
                >
                  <Icon name="undo" size={16} color={colors.accentInk} />
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.accentInk }}>
                    Undo last review
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => {
                  tapPress();
                  setFocusMode(false);
                  setUnreviewedOnly(false);
                }}
                style={{ marginTop: 8, paddingVertical: 10, paddingHorizontal: 16 }}
              >
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.accentInk }}>
                  Show all activity
                </Text>
              </Pressable>
            </View>
          )}
        </View>
        <UndoHost bottomOffset={Math.max(insets.bottom + 160, 180)} />
      </Screen>
    );
  }

  const listHeader = (
    <View style={{ gap: 10, paddingBottom: 8 }}>
      {error ? <LoadError message={error} onRetry={() => void load()} /> : null}
      {actionError ? <LoadError message={actionError.message} onRetry={actionError.retry} /> : null}

      {/* Search Bar + Filter Icon with indicator dot */}
      <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search merchants or notes" />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open filters"
          onPress={() => {
            tapPress();
            setFilters(true);
          }}
          style={styles.filterButton}
        >
          <Icon name="filter" size={18} color={colors.ink} />
          {filtered ? <View style={styles.filterDot} /> : null}
        </Pressable>
      </View>

      {/* Liquid Glass Quick Filter Capsule */}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 2 }}>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: !unreviewedOnly && !range }}
          onPress={() => {
            tapSelect();
            setUnreviewedOnly(false);
            setRange(null);
          }}
          style={[
            styles.quickPill,
            !unreviewedOnly && !range ? styles.quickPillActive : null,
          ]}
        >
          <Text
            style={[
              styles.quickPillText,
              !unreviewedOnly && !range ? styles.quickPillTextActive : null,
            ]}
          >
            All
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: unreviewedOnly }}
          onPress={() => {
            tapSelect();
            setUnreviewedOnly((curr) => !curr);
          }}
          style={[
            styles.quickPill,
            unreviewedOnly ? styles.quickPillActive : null,
          ]}
        >
          <Text
            style={[
              styles.quickPillText,
              unreviewedOnly ? styles.quickPillTextActive : null,
            ]}
          >
            Needs Review
          </Text>
          {unreviewed > 0 ? (
            <View
              style={{
                paddingHorizontal: 6,
                paddingVertical: 1,
                borderRadius: 99,
                backgroundColor: unreviewedOnly
                  ? palette.danger
                  : palette.scheme === "dark"
                    ? "rgba(255, 107, 74, 0.2)"
                    : "rgba(217, 74, 46, 0.12)",
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: unreviewedOnly ? "#fff" : palette.danger,
                  fontVariant: ["tabular-nums"],
                }}
              >
                {unreviewed}
              </Text>
            </View>
          ) : null}
        </Pressable>

        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: Boolean(range) }}
          onPress={() => {
            tapSelect();
            if (range) {
              setRange(null);
            } else {
              const now = new Date();
              setRange(monthRange(now.getFullYear(), now.getMonth() + 1));
            }
          }}
          style={[
            styles.quickPill,
            range ? styles.quickPillActive : null,
          ]}
        >
          <Text
            style={[
              styles.quickPillText,
              range ? styles.quickPillTextActive : null,
            ]}
          >
            This Month
          </Text>
        </Pressable>

        {unreviewedOnly && unreviewedRows.length > 0 ? (
          <Pressable
            onPress={() => {
              tapPress();
              setFocusMode(true);
            }}
            hitSlop={8}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 6,
              marginLeft: "auto",
            }}
          >
            <Icon name="spark" size={13} color={colors.accentInk} />
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.accentInk }}>Focus</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Active Filter Chips (for custom sheet filters) */}
      {accountName || categoryName || tag ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 }}>
          {accountName ? (
            <Pressable onPress={() => setAccountFilter("")} style={styles.activeChip}>
              <Text style={styles.activeChipText}>{accountName} ✕</Text>
            </Pressable>
          ) : null}
          {categoryName ? (
            <Pressable onPress={() => setCategoryId("")} style={styles.activeChip}>
              <Text style={styles.activeChipText}>{categoryName} ✕</Text>
            </Pressable>
          ) : null}
          {tag ? (
            <Pressable onPress={() => setTag("")} style={styles.activeChip}>
              <Text style={styles.activeChipText}>#{tag} ✕</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {selecting ? (
        <Pressable
          onPress={() => {
            tapPress();
            setSelecting(false);
            setSelectedIds([]);
          }}
          style={styles.cancelSelectChip}
        >
          <Text style={styles.cancelSelectText}>Cancel select</Text>
        </Pressable>
      ) : null}

      {rows === null && !error ? <Loading /> : null}
      {rows && grouped.length === 0 ? <Note>No matches. Try another search or clear a filter.</Note> : null}
    </View>
  );

  return (
    <Screen
      title="Activity"
      framed
      scrollable={false}
      action={
        <GlassButton
          label="Add"
          icon="plus"
          onPress={() => {
            tapPress();
            setAdding(true);
          }}
          compact
        />
      }
    >
      <FlatList
        data={flatData}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={listHeader}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews
        maxToRenderPerBatch={14}
        windowSize={7}
        initialNumToRender={14}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom + 88, 110) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={colors.ink} />}
        renderItem={({ item }) => {
          if (item.type === "header") {
            return (
              <View style={{ paddingTop: 16, paddingBottom: 8 }}>
                <Section title={item.title} trailing={item.flowText} />
              </View>
            );
          }
          const tx = item.tx;
          const amount = flowMoney(tx.amountCents);
          return (
            <View
              style={[
                styles.rowWrapper,
                item.isFirst && styles.rowFirst,
                item.isLast && styles.rowLast,
              ]}
            >
              <SwipeRow
                key={tx.id}
                divided={!item.isFirst}
                peek={!tx.reviewed}
                onPress={() => {
                  if (!selecting) {
                    setSelected(tx);
                    return;
                  }
                  setSelectedIds((current) =>
                    current.includes(tx.id) ? current.filter((id) => id !== tx.id) : [...current, tx.id],
                  );
                }}
                actions={[
                  { label: "Hide", tone: "danger", onPress: () => void hideTx(tx.id) },
                  tx.reviewed
                    ? { label: "Edit", tone: "ink", onPress: () => setSelected(tx) }
                    : { label: "Done", tone: "accent", onPress: () => void markDone(tx.id) },
                ]}
              >
                <View style={styles.txRowInner}>
                  {selecting ? (
                    <View style={[styles.checkbox, selectedIds.includes(tx.id) && styles.checkboxChecked]}>
                      {selectedIds.includes(tx.id) ? <Icon name="check" size={12} color="#fff" filled /> : null}
                    </View>
                  ) : null}
                  <MerchantMark name={tx.merchantName || tx.name} color={tx.category?.color ?? undefined} />
                  <View style={{ flex: 1, minWidth: 0, justifyContent: "center" }}>
                    <Text numberOfLines={1} style={styles.txName}>
                      {tx.name}
                    </Text>
                    <Text numberOfLines={1} style={styles.txMeta}>
                      {[tx.category?.name, tx.account?.name, tx.pending ? "Pending" : ""].filter(Boolean).join(" · ") || "Uncategorized"}
                    </Text>
                  </View>
                  <Text style={[styles.txAmount, { color: amount.color }]}>
                    {amount.text}
                  </Text>
                </View>
              </SwipeRow>
            </View>
          );
        }}
      />

      {/* Transaction Details / Edit Sheet */}
      {selected ? (
        <ChargeSheet
          tx={{
            ...selected,
            hidden: selected.hidden ?? false,
            notes: selected.notes ?? null,
            goalId: selected.goalId ?? null,
            isTransfer: selected.isTransfer ?? false,
            transferPairId: selected.transferPairId ?? null,
            originalDescription: selected.originalDescription ?? null,
            tags: selected.tags ?? [],
            splits: selected.splits ?? [],
          }}
          groups={groups}
          onClose={() => setSelected(null)}
          onOptimistic={(draft) => {
            const before = selected ?? sheetEdit.current?.before;
            if (!before) return;
            const source = rows ?? [];
            const ids = matchingReviewIds(source, before, draft.always);
            const snapshots = source.filter((row) => ids.includes(row.id));
            const known = snapshots.some((row) => row.id === before.id) ? snapshots : [before, ...snapshots];
            sheetEdit.current = { before, ids, snapshots: known, categoryId: draft.categoryId, hidden: draft.hidden };
            setActionError(null);
            reviewEpoch.current += 1;
            paintReviewed(ids, draft.categoryId, known);
            setRows((current) =>
              (current ?? []).flatMap((row) => {
                if (row.id !== before.id) return [row];
                if (draft.hidden) return [];
                return [{ ...row, name: draft.name || row.name }];
              }),
            );
            if (draft.hidden) {
              patches.current.set(before.id, { ...patches.current.get(before.id), hidden: true });
            }
          }}
          onRevert={(message, retry) => {
            const edit = sheetEdit.current;
            if (edit) {
              reviewEpoch.current += 1;
              unpaintReviewed(edit.ids, edit.snapshots);
            }
            dismissUndo();
            setActionError({ message, retry });
          }}
          onSaved={(_clearedIds, ruleId) => {
            const edit = sheetEdit.current;
            if (!edit) return;
            const before = edit.before;
            offerUndo("Saved", async () => {
              reviewEpoch.current += 1;
              unpaintReviewed(edit.ids, edit.snapshots);
              try {
                await api(`/api/transactions/${before.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({
                    name: before.name,
                    merchantName: before.merchantName,
                    categoryId: before.categoryId,
                    reviewed: before.reviewed,
                    hidden: before.hidden,
                    notes: before.notes,
                    goalId: before.goalId,
                    isTransfer: before.isTransfer,
                    transferPairId: before.transferPairId,
                    tags: (before.tags ?? []).map((tag) => tag.name),
                    splits: (before.splits ?? []).map((part) => ({
                      categoryId: part.categoryId,
                      amountCents: part.amountCents,
                    })),
                  }),
                });
                if (ruleId) await api(`/api/rules/${ruleId}`, { method: "DELETE" });
                void load();
              } catch {
                paintReviewed(edit.ids, edit.categoryId, edit.snapshots);
                setActionError({ message: "Could not undo that edit.", retry: () => undefined });
              }
            });
          }}
        />
      ) : null}

      {/* Filters Modal Sheet */}
      {filters ? (
        <Sheet title="Filter" onClose={() => setFilters(false)}>
          <Section title="Account" />
          <Card>
            <Pressable
              onPress={() => {
                tapSelect();
                setAccountFilter("");
              }}
              style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 16 }}
            >
              <Text style={{ color: !accountFilter ? colors.accentInk : colors.ink, fontWeight: !accountFilter ? "600" : "400" }}>
                All accounts
              </Text>
            </Pressable>
            {accounts.map((account) => (
              <Pressable
                key={account.id}
                onPress={() => {
                  tapSelect();
                  setAccountFilter(account.id);
                }}
                style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: colors.line }}
              >
                <Text style={{ color: accountFilter === account.id ? colors.accentInk : colors.ink, fontWeight: accountFilter === account.id ? "600" : "400" }}>
                  {account.name}
                </Text>
              </Pressable>
            ))}
          </Card>

          <Field label="Tag" value={tag} onChangeText={setTag} placeholder="Filter by tag" />

          <Button
            label={unreviewedOnly ? "Showing needs review" : "Needs review"}
            tone={unreviewedOnly ? "primary" : "quiet"}
            onPress={() => {
              tapSelect();
              setUnreviewedOnly((value) => !value);
            }}
          />

          <Button
            label="Select transactions"
            tone="quiet"
            onPress={() => {
              tapSelect();
              setSelecting(true);
              setSelectedIds([]);
              setFilters(false);
            }}
          />

          {month ? (
            <MonthNav
              year={month.year}
              month={month.month}
              label={monthLabel(month.year, month.month)}
              onChange={(year, mon) => setRange(monthRange(year, mon))}
            />
          ) : (
            <Button
              label="This month"
              tone="quiet"
              onPress={() => {
                tapSelect();
                const now = new Date();
                setRange(monthRange(now.getFullYear(), now.getMonth() + 1));
              }}
            />
          )}

          {range ? (
            <Button
              label="All months"
              tone="quiet"
              onPress={() => {
                tapSelect();
                setRange(null);
              }}
            />
          ) : null}

          <Section title="Category" />
          <Card>
            <Pressable
              onPress={() => {
                tapSelect();
                setCategoryId("");
              }}
              style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 16 }}
            >
              <Text style={{ color: !categoryId ? colors.accentInk : colors.ink, fontWeight: !categoryId ? "600" : "400" }}>
                All categories
              </Text>
            </Pressable>
            {categories.slice(0, 40).map((cat) => (
              <Pressable
                key={cat.id}
                onPress={() => {
                  tapSelect();
                  setCategoryId(cat.id);
                }}
                style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: colors.line }}
              >
                <Text style={{ color: categoryId === cat.id ? colors.accentInk : colors.ink, fontWeight: categoryId === cat.id ? "600" : "400" }}>
                  {cat.name}
                </Text>
              </Pressable>
            ))}
          </Card>

          {unreviewedRows.length > 0 && unreviewedRows.every((tx) => tx.categoryId) ? (
            <Button
              label={`Accept ${unreviewedRows.length}`}
              onPress={() => {
                const snapshots = unreviewedRows.filter((tx) => tx.categoryId);
                const ids = snapshots.map((tx) => tx.id);
                const restore = snapshots.map((tx) => ({ id: tx.id, categoryId: tx.categoryId }));
                setFilters(false);
                setActionError(null);
                reviewEpoch.current += 1;
                runUndoable({
                  label: "Accepted all",
                  apply: () => paintReviewed(ids, null, snapshots, true),
                  restore: () => {
                    reviewEpoch.current += 1;
                    unpaintReviewed(ids, snapshots);
                  },
                  request: () => api("/api/transactions/review-all", { method: "POST", body: JSON.stringify({ ids }) }).then(() => undefined),
                  compensate: () => api("/api/transactions/review-all", { method: "POST", body: JSON.stringify({ restore }) }).then(() => undefined),
                  onFailure: (retry) => setActionError({ message: "Could not accept those transactions.", retry }),
                  onUndoFailure: (retry) => setActionError({ message: "Could not undo accepting those.", retry }),
                });
              }}
            />
          ) : null}
        </Sheet>
      ) : null}

      {/* Add Transaction Sheet */}
      {adding ? (
        <Sheet title="Add" onClose={() => setAdding(false)}>
          <Field label="Name" value={name} onChangeText={setName} placeholder="Coffee, paycheck…" />
          <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
          <Segment
            value={income ? "in" : "out"}
            onChange={(value) => setIncome(value === "in")}
            options={[
              { value: "out", label: "Spending" },
              { value: "in", label: "Income" },
            ]}
          />
          <Section title="Category" />
          <Card>
            {categories.slice(0, 24).map((cat, index) => (
              <Pressable
                key={cat.id}
                onPress={() => {
                  tapSelect();
                  setAddCategory(cat.id);
                }}
                style={{
                  minHeight: 44,
                  justifyContent: "center",
                  paddingHorizontal: 16,
                  borderTopWidth: index ? 1 : 0,
                  borderTopColor: colors.line,
                }}
              >
                <Text style={{ color: addCategory === cat.id ? colors.accentInk : colors.ink, fontWeight: addCategory === cat.id ? "600" : "400" }}>
                  {cat.name}
                </Text>
              </Pressable>
            ))}
          </Card>
          <Button label={addMore ? "Less" : "More"} tone="quiet" onPress={() => setAddMore((value) => !value)} />
          {addMore ? <Field label="Date" value={addDate} onChangeText={setAddDate} placeholder="YYYY-MM-DD" /> : null}
          <Section title="Account" />
          <Card>
            {accounts.map((acct, index) => (
              <Pressable
                key={acct.id}
                onPress={() => {
                  tapSelect();
                  setAccountId(acct.id);
                }}
                style={{
                  minHeight: 44,
                  justifyContent: "center",
                  paddingHorizontal: 16,
                  borderTopWidth: index ? 1 : 0,
                  borderTopColor: colors.line,
                }}
              >
                <Text style={{ color: accountId === acct.id ? colors.accentInk : colors.ink, fontWeight: accountId === acct.id ? "600" : "400" }}>
                  {acct.name}
                </Text>
              </Pressable>
            ))}
          </Card>
          <Button label="Add transaction" onPress={add} />
        </Sheet>
      ) : null}

      {/* Multi-Select Floating Bar */}
      {selecting && selectedIds.length ? (
        <View style={styles.bulkBar}>
          {!reduceTransparency ? (
            <BlurView
              intensity={palette.scheme === "dark" ? 75 : 85}
              tint={palette.blurTint}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          <Text style={styles.bulkText}>{`${selectedIds.length} selected`}</Text>
          <Button
            label="Mark reviewed"
            onPress={() => {
              const snapshots = (rows ?? []).filter((tx) => selectedIds.includes(tx.id));
              const ids = snapshots.map((tx) => tx.id);
              const categoryOverride = bulkCategory || null;
              setSelectedIds([]);
              setSelecting(false);
              setActionError(null);
              reviewEpoch.current += 1;
              runUndoable({
                label: "Reviewed selected",
                apply: () => paintReviewed(ids, categoryOverride, snapshots, !categoryOverride),
                restore: () => {
                  reviewEpoch.current += 1;
                  unpaintReviewed(ids, snapshots);
                },
                request: () =>
                  Promise.all(
                    ids.map((id) =>
                      api(`/api/transactions/${id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ categoryId: categoryOverride || undefined, reviewed: true }),
                      }),
                    ),
                  ).then(() => undefined),
                compensate: () =>
                  Promise.all(
                    snapshots.map((tx) =>
                      api(`/api/transactions/${tx.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ categoryId: tx.categoryId, reviewed: tx.reviewed, hidden: tx.hidden }),
                      }),
                    ),
                  ).then(() => undefined),
                onFailure: (retry) => setActionError({ message: "Could not mark those reviewed.", retry }),
                onUndoFailure: (retry) => setActionError({ message: "Could not undo that review.", retry }),
              });
            }}
          />
        </View>
      ) : null}

      <UndoHost />
    </Screen>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderCurve: "continuous",
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderTopColor: colors.specularTop || colors.glassBorder,
    borderBottomColor: colors.specularBottom || colors.glassBorderSubtle,
    borderLeftColor: colors.specularSides || colors.glassBorderSubtle,
    borderRightColor: colors.specularSides || colors.glassBorderSubtle,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  filterDot: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  activeChip: {
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    borderCurve: "continuous",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  activeChipText: {
    color: colors.accentInk,
    fontSize: 13,
    fontWeight: "600",
  },
  cancelSelectChip: {
    alignSelf: "flex-start",
    backgroundColor: colors.fill,
    borderRadius: 999,
    borderCurve: "continuous",
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 4,
  },
  cancelSelectText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "500",
  },
  addButton: {
    backgroundColor: colors.control,
    borderRadius: 999,
    borderCurve: "continuous",
    minHeight: 34,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonText: {
    color: colors.controlInk,
    fontWeight: "600",
    fontSize: 14,
  },
  rowWrapper: {
    backgroundColor: colors.card,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  rowFirst: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderCurve: "continuous",
    borderTopWidth: 1,
    borderTopColor: colors.specularTop || colors.line,
  },
  rowLast: {
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderCurve: "continuous",
    borderBottomWidth: 1,
    borderBottomColor: colors.specularBottom || colors.line,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  txRowInner: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
    backgroundColor: colors.card,
  },
  txName: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.ink,
    letterSpacing: -0.2,
  },
  txMeta: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 1,
  },
  txAmount: {
    fontSize: 16,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.tertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  bulkBar: {
    position: "absolute",
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: colors.scheme === "dark" ? "rgba(23, 27, 35, 0.88)" : "rgba(255, 255, 255, 0.90)",
    borderRadius: 22,
    borderCurve: "continuous",
    borderWidth: 1,
    borderTopColor: colors.specularTop || colors.glassBorder,
    borderBottomColor: colors.specularBottom || colors.glassBorderSubtle,
    borderLeftColor: colors.specularSides || colors.glassBorderSubtle,
    borderRightColor: colors.specularSides || colors.glassBorderSubtle,
    padding: 14,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOpacity: colors.scheme === "dark" ? 0.45 : 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  bulkText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.ink,
  },
  quickPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
    borderCurve: "continuous",
    backgroundColor: colors.scheme === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.05)",
    borderWidth: 1,
    borderColor: colors.glassBorderSubtle,
  },
  quickPillActive: {
    backgroundColor: colors.control,
    borderColor: colors.control,
  },
  quickPillText: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.muted,
    letterSpacing: -0.1,
  },
  quickPillTextActive: {
    color: colors.controlInk,
    fontWeight: "700",
  },
});
}
