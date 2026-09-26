import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, load as read, peek } from "../../src/api";
import { Charge, ChargeGroup, ChargeSheet } from "../../src/charge";
import { ReviewDeck } from "../../src/decide";
import { categorizeLabel, dayLabel, flowMoney, merchantMatchKey, monthLabel, monthRange, todayISO } from "../../src/format";
import { tapPress, tapSelect } from "../../src/haptic";
import { Icon, MerchantMark } from "../../src/icons";
import { ConfirmMark, offerUndo, UndoHost } from "../../src/toast";
import { SwipeRow } from "../../src/swipe";
import {
  Button,
  Card,
  colors,
  Field,
  GlassButton,
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
  const [busy, setBusy] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkCategory, setBulkCategory] = useState("");
  const [addCategory, setAddCategory] = useState("");
  const [addDate, setAddDate] = useState(todayISO());
  const [addMore, setAddMore] = useState(false);
  const cleared = useRef(new Set<string>());

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
    return Promise.all([
      read<TxPayload>(txPath(search, unreviewedOnly, categoryId, accountFilter, tag, range)),
      read<{ groups: ChargeGroup[] }>("/api/categories"),
      read<{ accounts: { id: string; name: string }[] }>("/api/accounts"),
    ])
      .then(([tx, cats, accts]) => {
        setRows(tx.transactions.filter((t) => !cleared.current.has(t.id)));
        setUnreviewed(tx.unreviewed);
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

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Tx[]>();
    for (const tx of rows ?? []) {
      const list = map.get(tx.date) ?? [];
      list.push(tx);
      map.set(tx.date, list);
    }
    return [...map.entries()];
  }, [rows]);

  const unreviewedRows = useMemo(() => (rows ?? []).filter((tx) => !tx.reviewed), [rows]);
  const categories = useMemo(() => groups.flatMap((group) => group.categories), [groups]);

  function dropFromQueue(ids: string[]) {
    for (const id of ids) cleared.current.add(id);
    const gone = new Set(ids);
    setRows((current) => (current ? current.filter((r) => !gone.has(r.id)) : []));
    setUnreviewed((count) => Math.max(0, count - ids.length));
  }

  function restoreCleared(ids: string[]) {
    for (const id of ids) cleared.current.delete(id);
  }

  async function handleReviewConfirm(tx: Charge, nextCategoryId: string | null, makeRule: boolean) {
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

      offerUndo(appliedCount > 0 ? `Categorized ${appliedCount + 1}` : "Reviewed", async () => {
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
        load();
      });
    } catch {
      load();
    }
  }

  function handleReviewSkip(tx: Charge) {
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

  async function hideTx(id: string) {
    await api(`/api/transactions/${id}`, { method: "PATCH", body: JSON.stringify({ hidden: true }) });
    setRows((current) => (current ? current.filter((r) => r.id !== id) : []));
    offerUndo("Hidden", async () => {
      await api(`/api/transactions/${id}`, { method: "PATCH", body: JSON.stringify({ hidden: false }) });
      load();
    });
    load();
  }

  async function markDone(id: string) {
    const previous = rows?.find((tx) => tx.id === id);
    if (!previous) return;
    dropFromQueue([id]);
    try {
      await api(`/api/transactions/${id}`, { method: "PATCH", body: JSON.stringify({ reviewed: true }) });
      offerUndo("Marked reviewed", async () => {
        restoreCleared([id]);
        await api(`/api/transactions/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ reviewed: false, categoryId: previous.categoryId, hidden: previous.hidden }),
        });
        load();
      });
    } finally {
      load();
    }
  }

  async function add() {
    setBusy(true);
    try {
      const dollars = Number(amount);
      await api("/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          accountId,
          name,
          amount: income ? -Math.abs(dollars) : Math.abs(dollars),
          date: addDate || todayISO(),
          categoryId: addCategory || undefined,
        }),
      });
      setName("");
      setAmount("");
      setAdding(false);
      offerUndo("Added", async () => {
        load();
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add");
    } finally {
      setBusy(false);
    }
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
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: Math.max(insets.bottom + 88, 110) }}
        >
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
            />
          ) : (
            <View style={{ alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32, paddingVertical: 40 }}>
              <ConfirmMark size={64} />
              <Text style={{ fontSize: 22, fontWeight: "700", letterSpacing: -0.5, color: colors.ink }}>
                You’re caught up
              </Text>
              <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center", lineHeight: 20 }}>
                Every transaction has been reviewed.
              </Text>
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
        </ScrollView>
        <UndoHost />
      </Screen>
    );
  }

  const listHeader = (
    <View style={{ gap: 12, paddingBottom: 8 }}>
      {error ? <Note>{error}</Note> : null}

      {/* Review banner when unreviewed charges exist */}
      {unreviewed > 0 && !unreviewedOnly ? (
        <ReviewBanner
          label={categorizeLabel(unreviewed)}
          onPress={() => {
            tapPress();
            setFocusMode(true);
            setUnreviewedOnly(true);
          }}
        />
      ) : null}

      {/* Search Bar + Filter Icon with indicator dot */}
      <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search merchants or notes" />
        </View>
        <Pressable
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

      {/* Active Filter Chips (1:1 with Web) */}
      {filtered ? (
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
          {range ? (
            <Pressable onPress={() => setRange(null)} style={styles.activeChip}>
              <Text style={styles.activeChipText}>Dates ✕</Text>
            </Pressable>
          ) : null}
          {unreviewedOnly ? (
            <Pressable onPress={() => setUnreviewedOnly(false)} style={styles.activeChip}>
              <Text style={styles.activeChipText}>Needs review ✕</Text>
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
          onSaved={() => {
            setSelected(null);
            offerUndo("Saved", async () => {
              load();
            });
            load();
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
              onPress={() =>
                void api("/api/transactions/review-all", {
                  method: "POST",
                  body: JSON.stringify({ ids: unreviewedRows.map((tx) => tx.id) }),
                }).then(() => {
                  setFilters(false);
                  offerUndo("Accepted all", async () => {
                    load();
                  });
                  load();
                })
              }
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
          <Button label="Add transaction" onPress={() => void add()} busy={busy} />
        </Sheet>
      ) : null}

      {/* Multi-Select Floating Bar */}
      {selecting && selectedIds.length ? (
        <View style={styles.bulkBar}>
          <Text style={styles.bulkText}>{`${selectedIds.length} selected`}</Text>
          <Button
            label="Mark reviewed"
            onPress={() =>
              void Promise.all(
                selectedIds.map((id) =>
                  api(`/api/transactions/${id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ categoryId: bulkCategory || undefined, reviewed: true }),
                  }),
                ),
              ).then(() => {
                setSelectedIds([]);
                setSelecting(false);
                offerUndo("Reviewed selected", async () => {
                  load();
                });
                load();
              })
            }
          />
        </View>
      ) : null}

      <UndoHost />
    </Screen>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  bulkText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.ink,
  },
});
