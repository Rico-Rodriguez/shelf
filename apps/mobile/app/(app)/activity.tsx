import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api } from "../../src/api";
import { categorizeLabel, dayLabel, flowMoney, monthLabel, monthRange } from "../../src/format";
import { Button, Card, colors, Field, FlowAmount, LedgerRow, Loading, MonthNav, Note, ReviewBanner, Screen, SearchField, Section, Sheet } from "../../src/ui";

type Tx = {
  id: string;
  name: string;
  merchantName: string | null;
  amountCents: number;
  date: string;
  pending: boolean;
  reviewed: boolean;
  categoryId: string | null;
  category: { name: string; color?: string | null } | null;
  account: { name: string } | null;
};

type Group = { id?: string; name: string; categories: { id: string; name: string }[] };

export default function ActivityScreen() {
  const params = useLocalSearchParams<{ q?: string; categoryId?: string; start?: string; end?: string }>();
  const [query, setQuery] = useState(typeof params.q === "string" ? params.q : "");
  const [search, setSearch] = useState(query);
  const [unreviewedOnly, setUnreviewedOnly] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [categoryId, setCategoryId] = useState(typeof params.categoryId === "string" ? params.categoryId : "");
  const [range, setRange] = useState<{ start: string; end: string } | null>(
    typeof params.start === "string" && typeof params.end === "string" ? { start: params.start, end: params.end } : null,
  );
  const [rows, setRows] = useState<Tx[] | null>(null);
  const [unreviewed, setUnreviewed] = useState(0);
  const [groups, setGroups] = useState<Group[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Tx | null>(null);
  const [filters, setFilters] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [income, setIncome] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(() => {
    const qs = new URLSearchParams();
    if (search.trim()) qs.set("q", search.trim());
    if (unreviewedOnly) qs.set("reviewed", "false");
    if (categoryId) qs.set("categoryId", categoryId);
    if (range) {
      qs.set("start", range.start);
      qs.set("end", range.end);
    }
    void Promise.all([
      api<{ transactions: Tx[]; unreviewed: number }>(`/api/transactions?${qs.toString()}`),
      api<{ groups: Group[] }>("/api/categories"),
      api<{ accounts: { id: string; name: string }[] }>("/api/accounts"),
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
  }, [search, unreviewedOnly, categoryId, range]);

  useFocusEffect(load);

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
  const currentReview = reviewRows[0] ?? null;
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
        body: JSON.stringify({ accountId, name, amount: income ? -Math.abs(dollars) : Math.abs(dollars), date: new Date().toISOString().slice(0, 10) }),
      });
      setName("");
      setAmount("");
      setAdding(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add");
    } finally {
      setBusy(false);
    }
  }

  if (reviewing) {
    return (
      <Screen title="Review" framed action={<Pressable onPress={() => setReviewing(false)}><Text style={{ color: colors.accentInk, fontWeight: "600" }}>Close</Text></Pressable>}>
        {error ? <Note>{error}</Note> : null}
        {!currentReview ? <Note>Everything visible is categorized.</Note> : null}
        {currentReview ? (
          <>
            <Note>{`${reviewRows.length} left`}</Note>
            <Card>
              <View style={{ padding: 16, gap: 6 }}>
                <Text style={{ fontSize: 13, color: colors.muted }}>{dayLabel(currentReview.date)}{currentReview.account?.name ? ` · ${currentReview.account.name}` : ""}</Text>
                <Text style={{ fontSize: 22, fontWeight: "600", letterSpacing: -0.4, color: colors.ink }}>{currentReview.merchantName || currentReview.name}</Text>
                <FlowAmount cents={currentReview.amountCents} size={32} />
              </View>
            </Card>
            {groups
              .filter((group) => group.name !== "Income")
              .map((group) => (
                <View key={group.name} style={{ gap: 8 }}>
                  <Section title={group.name} />
                  <Card>
                    {group.categories.map((category, index) => (
                      <Pressable
                        key={category.id}
                        onPress={() => void patch(currentReview.id, { categoryId: category.id, reviewed: true })}
                        style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 16, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}
                      >
                        <Text style={{ fontSize: 16, color: colors.ink }}>{category.name}</Text>
                      </Pressable>
                    ))}
                  </Card>
                </View>
              ))}
            <Button label="Skip" tone="quiet" onPress={() => setRows((current) => (current ?? []).filter((tx) => tx.id !== currentReview.id))} />
            {currentReview.categoryId ? <Button label="Accept this category" onPress={() => void patch(currentReview.id, { reviewed: true })} /> : null}
          </>
        ) : null}
      </Screen>
    );
  }

  const month = range ? { year: Number(range.start.slice(0, 4)), month: Number(range.start.slice(5, 7)) } : null;

  return (
    <Screen
      title="Activity"
      framed
      action={
        <Pressable onPress={() => setAdding(true)} style={{ backgroundColor: colors.ink, borderRadius: 999, minHeight: 36, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "600" }}>Add</Text>
        </Pressable>
      }
    >
      {error ? <Note>{error}</Note> : null}
      {unreviewed > 0 ? (
        <ReviewBanner
          label={categorizeLabel(unreviewed)}
          onPress={() => {
            setUnreviewedOnly(true);
            setReviewing(true);
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
      {unreviewedOnly || categoryId || range ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {unreviewedOnly ? <Pressable onPress={() => setUnreviewedOnly(false)} style={chip}><Text>Needs review</Text></Pressable> : null}
          {categoryId ? <Pressable onPress={() => setCategoryId("")} style={chip}><Text>{categories.find((row) => row.id === categoryId)?.name ?? "Category"}</Text></Pressable> : null}
          {month ? <Pressable onPress={() => setRange(null)} style={chip}><Text>{monthLabel(month.year, month.month)}</Text></Pressable> : null}
        </View>
      ) : null}
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
                  <LedgerRow
                    key={tx.id}
                    divided={index > 0}
                    name={tx.merchantName || tx.name}
                    color={tx.category?.color}
                    meta={[tx.category?.name ?? "Uncategorized", tx.account?.name, tx.pending ? "Pending" : ""].filter(Boolean).join(" · ")}
                    amount={amount.text}
                    amountColor={amount.color}
                    onPress={() => setSelected(tx)}
                  />
                );
              })}
            </Card>
          </View>
        );
      })}

      {selected ? (
        <Sheet title={selected.merchantName || selected.name} onClose={() => setSelected(null)}>
          <FlowAmount cents={selected.amountCents} size={32} />
          <Note>{[dayLabel(selected.date), selected.account?.name, selected.pending ? "Pending" : ""].filter(Boolean).join(" · ")}</Note>
          <Button label={selected.reviewed ? "Mark unreviewed" : "Mark reviewed"} onPress={() => void patch(selected.id, { reviewed: !selected.reviewed })} />
          <Button label="Hide" tone="quiet" onPress={() => void patch(selected.id, { hidden: true })} />
          {groups.map((group) => (
            <View key={group.name} style={{ gap: 8 }}>
              <Section title={group.name} />
              <Card>
                {group.categories.map((category, index) => (
                  <Pressable
                    key={category.id}
                    onPress={() => void patch(selected.id, { categoryId: category.id, reviewed: true })}
                    style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 16, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line, backgroundColor: selected.categoryId === category.id ? colors.accentSoft : "transparent" }}
                  >
                    <Text style={{ fontSize: 16, color: selected.categoryId === category.id ? colors.accentInk : colors.ink }}>{category.name}</Text>
                  </Pressable>
                ))}
              </Card>
            </View>
          ))}
        </Sheet>
      ) : null}

      {filters ? (
        <Sheet title="Filter" onClose={() => setFilters(false)}>
          <Button label={unreviewedOnly ? "Showing needs review" : "Needs review"} tone={unreviewedOnly ? "primary" : "quiet"} onPress={() => setUnreviewedOnly((value) => !value)} />
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
          <Button label={income ? "Income" : "Spending"} tone="quiet" onPress={() => setIncome((value) => !value)} />
          {accounts.map((account) => (
            <Pressable key={account.id} onPress={() => setAccountId(account.id)}>
              <Text style={{ fontSize: 16, color: accountId === account.id ? colors.accentInk : colors.ink, paddingVertical: 8 }}>{account.name}</Text>
            </Pressable>
          ))}
          <Button label="Add" onPress={() => void add()} busy={busy} />
        </Sheet>
      ) : null}
    </Screen>
  );
}

const chip = { backgroundColor: colors.fill, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 };
