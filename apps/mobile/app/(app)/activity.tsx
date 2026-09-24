import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api, load as read, peek } from "../../src/api";
import { categorizeLabel, dayLabel, flowMoney, monthLabel, monthRange, todayISO } from "../../src/format";
import { Charge, ChargeSheet } from "../../src/charge";
import { celebrate } from "../../src/toast";
import { SwipeRow } from "../../src/swipe";
import { Button, Card, colors, Field, LedgerRow, Loading, MonthNav, Note, ReviewBanner, Screen, SearchField, Section, Segment, Sheet } from "../../src/ui";

type Tx = Charge;

type Group = { id?: string; name: string; categories: { id: string; name: string }[] };
type TxPayload = { transactions: Tx[]; unreviewed: number; faces?: Record<string, { monthCents: number; count: number }>; frequentCategoryIds?: string[] };

function txPath(search: string, unreviewedOnly: boolean, categoryId: string, accountFilter: string, tag: string, range: { start: string; end: string } | null) {
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
  const params = useLocalSearchParams<{ q?: string; categoryId?: string; start?: string; end?: string; accountId?: string; tag?: string; reviewed?: string; focus?: string }>();
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
    return peek<TxPayload>(txPath(typeof params.q === "string" ? params.q : "", params.reviewed === "false", typeof params.categoryId === "string" ? params.categoryId : "", typeof params.accountId === "string" ? params.accountId : "", typeof params.tag === "string" ? params.tag : "", start))?.transactions ?? null;
  });
  const [unreviewed, setUnreviewed] = useState(0);
  const [groups, setGroups] = useState<Group[]>(() => peek<{ groups: Group[] }>("/api/categories")?.groups ?? []);
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
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(() => {
    return Promise.all([
      read<TxPayload>(txPath(search, unreviewedOnly, categoryId, accountFilter, tag, range)),
      read<{ groups: Group[] }>("/api/categories"),
      read<{ accounts: { id: string; name: string }[] }>("/api/accounts"),
    ])
      .then(([tx, cats, accts]) => {
        setRows(tx.transactions);
        setUnreviewed(tx.unreviewed);
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

  const reviewRows = (rows ?? []).filter((tx) => !tx.reviewed);
  const categories = groups.flatMap((group) => group.categories);

  async function patch(id: string, body: Record<string, unknown>) {
    await api(`/api/transactions/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    setSelected(null);
    load();
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
      celebrate("Added");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add");
    } finally {
      setBusy(false);
    }
  }

  const month = range ? { year: Number(range.start.slice(0, 4)), month: Number(range.start.slice(5, 7)) } : null;

  return (
    <Screen
      title="Activity"
      framed
      onRefresh={load}
      action={
        <Pressable onPress={() => setAdding(true)} style={{ backgroundColor: colors.control, borderRadius: 999, minHeight: 36, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: colors.controlInk, fontWeight: "600" }}>Add</Text>
        </Pressable>
      }
    >
      {error ? <Note>{error}</Note> : null}
      {unreviewed > 0 ? (
        <ReviewBanner
          label={categorizeLabel(unreviewed)}
          onPress={() => {
            router.push("/review");
          }}
        />
      ) : null}
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search merchants or notes" />
        </View>
        <Pressable onPress={() => setFilters(true)} style={{ minHeight: 40, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: colors.accentInk, fontWeight: "600" }}>Filter</Text>
        </Pressable>
      </View>
      {unreviewedOnly || categoryId || range || accountFilter || tag ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {unreviewedOnly ? <Pressable onPress={() => setUnreviewedOnly(false)} style={chip}><Text>Needs review</Text></Pressable> : null}
          {accountFilter ? <Pressable onPress={() => setAccountFilter("")} style={chip}><Text>{accounts.find((row) => row.id === accountFilter)?.name ?? "Account"}</Text></Pressable> : null}
          {categoryId ? <Pressable onPress={() => setCategoryId("")} style={chip}><Text>{categories.find((row) => row.id === categoryId)?.name ?? "Category"}</Text></Pressable> : null}
          {tag ? <Pressable onPress={() => setTag("")} style={chip}><Text>{tag}</Text></Pressable> : null}
          {month ? <Pressable onPress={() => setRange(null)} style={chip}><Text>{monthLabel(month.year, month.month)}</Text></Pressable> : null}
        </View>
      ) : null}
      {selecting ? <Button label="Cancel select" tone="quiet" onPress={() => { setSelecting(false); setSelectedIds([]); }} /> : null}
      {rows === null && !error ? <Loading /> : null}
      {rows && grouped.length === 0 ? <Note>No matches. Try another search or clear a filter.</Note> : null}
      {grouped.map(([date, items]) => {
        const dayNet = items.reduce((sum, tx) => sum + tx.amountCents, 0);
        const flow = flowMoney(dayNet);
        return (
          <View key={date} style={{ gap: 8 }}>
            <Section title={dayLabel(date)} trailing={flow.text} />
            <Card>
              {items.map((tx, index) => {
                const amount = flowMoney(tx.amountCents);
                return (
                  <SwipeRow
                    key={tx.id}
                    divided={index > 0}
                    peek={!tx.reviewed}
                    onPress={() => {
                      if (!selecting) {
                        setSelected(tx);
                        return;
                      }
                      setSelectedIds((current) => (current.includes(tx.id) ? current.filter((id) => id !== tx.id) : [...current, tx.id]));
                    }}
                    actions={[
                      { label: "Hide", tone: "danger", onPress: () => void patch(tx.id, { hidden: true }) },
                      tx.reviewed
                        ? { label: "Edit", tone: "ink", onPress: () => setSelected(tx) }
                        : { label: "Done", tone: "accent", onPress: () => { celebrate("Reviewed"); void patch(tx.id, { reviewed: true }); } },
                    ]}
                  >
                    <LedgerRow
                      name={`${selecting && selectedIds.includes(tx.id) ? "✓ " : ""}${tx.name}`}
                      color={tx.category?.color}
                      meta={[tx.category?.name ?? "Uncategorized", tx.account?.name, tx.pending ? "Pending" : ""].filter(Boolean).join(" · ")}
                      amount={amount.text}
                      amountColor={amount.color}
                    />
                  </SwipeRow>
                );
              })}
            </Card>
          </View>
        );
      })}

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
            celebrate("Saved");
            load();
          }}
        />
      ) : null}

      {filters ? (
        <Sheet title="Filter" onClose={() => setFilters(false)}>
          <Section title="Account" />
          <Card>
            <Pressable onPress={() => setAccountFilter("")} style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 16 }}>
              <Text style={{ color: accountFilter ? colors.ink : colors.accentInk }}>All accounts</Text>
            </Pressable>
            {accounts.map((account) => (
              <Pressable key={account.id} onPress={() => setAccountFilter(account.id)} style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: colors.line }}>
                <Text style={{ color: accountFilter === account.id ? colors.accentInk : colors.ink }}>{account.name}</Text>
              </Pressable>
            ))}
          </Card>
          <Field label="Tag" value={tag} onChangeText={setTag} />
          <Button label={unreviewedOnly ? "Showing needs review" : "Needs review"} tone={unreviewedOnly ? "primary" : "quiet"} onPress={() => setUnreviewedOnly((value) => !value)} />
          <Button label="Select transactions" tone="quiet" onPress={() => { setSelecting(true); setSelectedIds([]); setFilters(false); }} />
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
                const now = new Date();
                setRange(monthRange(now.getFullYear(), now.getMonth() + 1));
              }}
            />
          )}
          {range ? <Button label="All months" tone="quiet" onPress={() => setRange(null)} /> : null}
          <Section title="Category" />
          <Card>
            <Pressable onPress={() => setCategoryId("")} style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 16 }}>
              <Text style={{ color: categoryId ? colors.ink : colors.accentInk }}>All categories</Text>
            </Pressable>
            {categories.slice(0, 40).map((category) => (
              <Pressable key={category.id} onPress={() => setCategoryId(category.id)} style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: colors.line }}>
                <Text style={{ color: categoryId === category.id ? colors.accentInk : colors.ink }}>{category.name}</Text>
              </Pressable>
            ))}
          </Card>
          {reviewRows.length > 0 && reviewRows.every((tx) => tx.categoryId) ? (
            <Button
              label={`Accept ${reviewRows.length}`}
              onPress={() =>
                void api("/api/transactions/review-all", {
                  method: "POST",
                  body: JSON.stringify({ ids: reviewRows.map((tx) => tx.id) }),
                }).then(() => {
                  setFilters(false);
                  celebrate("Accepted");
                  load();
                })
              }
            />
          ) : null}
        </Sheet>
      ) : null}

      {adding ? (
        <Sheet title="Add" onClose={() => setAdding(false)}>
          <Field label="Name" value={name} onChangeText={setName} />
          <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
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
            {categories.slice(0, 24).map((category, index) => (
              <Pressable key={category.id} onPress={() => setAddCategory(category.id)} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 16, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
                <Text style={{ color: addCategory === category.id ? colors.accentInk : colors.ink }}>{category.name}</Text>
              </Pressable>
            ))}
          </Card>
          <Button label={addMore ? "Less" : "More"} tone="quiet" onPress={() => setAddMore((value) => !value)} />
          {addMore ? <Field label="Date" value={addDate} onChangeText={setAddDate} placeholder="YYYY-MM-DD" /> : null}
          {accounts.map((account) => (
            <Pressable key={account.id} onPress={() => setAccountId(account.id)}>
              <Text style={{ fontSize: 16, color: accountId === account.id ? colors.accentInk : colors.ink, paddingVertical: 8 }}>{account.name}</Text>
            </Pressable>
          ))}
          <Button label="Add" onPress={() => void add()} busy={busy} />
        </Sheet>
      ) : null}

      {selecting && selectedIds.length ? (
        <Card>
          <View style={{ padding: 12, gap: 8 }}>
            <Note>{`${selectedIds.length} selected`}</Note>
            {categories.slice(0, 12).map((category) => (
              <Pressable key={category.id} onPress={() => setBulkCategory(category.id)}>
                <Text style={{ color: bulkCategory === category.id ? colors.accentInk : colors.ink, paddingVertical: 6 }}>{category.name}</Text>
              </Pressable>
            ))}
            <Button
              label="Apply"
              onPress={() =>
                void Promise.all(
                  selectedIds.map((id) => api(`/api/transactions/${id}`, { method: "PATCH", body: JSON.stringify({ categoryId: bulkCategory || undefined, reviewed: true }) })),
                ).then(() => {
                  setSelectedIds([]);
                  setSelecting(false);
                  celebrate("Updated");
                  load();
                })
              }
            />
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}

const chip = { backgroundColor: colors.fill, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 };

