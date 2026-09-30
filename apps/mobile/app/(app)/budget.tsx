import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { api, load as read, peek } from "../../src/api";
import { dayLabel, flowMoney, money, monthLabel, monthRange, shelfColor, shortMonthLabel } from "../../src/format";
import { tapPress, tapSelect } from "../../src/haptic";
import { celebrate } from "../../src/toast";
import { Button, Card, colors, Facts, Field, GlassIconButton, Hero, InlineLoading, Loading, MonthNav, Note, Progress, ProgressRing, Screen, Section, Sheet } from "../../src/ui";
import { Icon } from "../../src/icons";

type BudgetRow = {
  category: { id: string; name: string; sortOrder?: number };
  group: { id: string; name: string; color: string; sortOrder: number } | null;
  plannedCents: number;
  availableCents: number;
  spentCents: number;
  remainingCents: number;
  rolloverInCents?: number;
};

type Budget = {
  year: number;
  month: number;
  plannedIncomeCents: number;
  leftoverCents: number;
  expensePlannedCents: number;
  expenseSpentCents: number;
  spendSeries?: { date: string; cents: number }[];
  rows: BudgetRow[];
};

type MonthTx = { id: string; name: string; merchantName: string | null; amountCents: number; date: string; categoryId: string | null };

export default function BudgetScreen() {
  const now = new Date();
  const opening = peek<Budget>(`/api/budget?year=${now.getFullYear()}&month=${now.getMonth() + 1}`);
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [data, setData] = useState<Budget | null>(opening ?? null);
  const [income, setIncome] = useState(opening ? (opening.plannedIncomeCents / 100).toFixed(0) : "");
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [showUnused, setShowUnused] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [editing, setEditing] = useState<BudgetRow | null>(null);
  const [planned, setPlanned] = useState("");
  const [catName, setCatName] = useState("");
  const [txs, setTxs] = useState<MonthTx[] | null>(null);
  const [groupsList, setGroupsList] = useState<{ id: string; name: string }[]>([]);
  const [adding, setAdding] = useState<{ groupId: string; name: string } | null>(null);
  const [catGroups, setCatGroups] = useState<{ name: string; categories: { id: string; name: string }[] }[]>([]);
  const [moving, setMoving] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    return read<Budget>(`/api/budget?year=${cursor.year}&month=${cursor.month}`)
      .then((next) => {
        setData(next);
        setIncome((Number(next.plannedIncomeCents) / 100).toFixed(0));
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load the plan"));
  }, [cursor]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const groups = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { id: string; name: string; color: string; sortOrder: number; rows: BudgetRow[] }>();
    for (const row of data.rows) {
      const id = row.group?.id ?? "other";
      const bucket = map.get(id) ?? {
        id,
        name: row.group?.name ?? "Other",
        color: row.group?.color ?? "#8B939E",
        sortOrder: row.group?.sortOrder ?? 99,
        rows: [],
      };
      bucket.rows.push(row);
      map.set(id, bucket);
    }
    return [...map.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [data]);

  const quiet = (row: BudgetRow) => row.spentCents <= 0 && row.availableCents <= 0 && (row.rolloverInCents ?? 0) <= 0;
  const hiddenCount = groups.reduce((sum, group) => sum + group.rows.filter(quiet).length, 0);
  const visibleGroups = showUnused
    ? groups
    : groups.map((group) => ({ ...group, rows: group.rows.filter((row) => !quiet(row)) })).filter((group) => group.rows.length > 0);

  async function saveIncome() {
    if (!data) return;
    await api("/api/budget", {
      method: "PUT",
      body: JSON.stringify({ year: data.year, month: data.month, plannedIncomeCents: Math.round(Number(income) * 100) }),
    });
    load();
  }

  async function saveCategory() {
    if (!data || !editing) return;
    const nextPlanned = Math.round(Number(planned || 0) * 100);
    const catId = editing.category.id;
    const nextName = catName.trim() || editing.category.name;

    // Optimistic update for instant UI feedback
    setData((current) => {
      if (!current) return current;
      const nextRows = current.rows.map((r) =>
        r.category.id === catId
          ? {
              ...r,
              plannedCents: nextPlanned,
              remainingCents: nextPlanned - r.spentCents,
              category: { ...r.category, name: nextName },
            }
          : r
      );
      const newExpensePlanned = nextRows.reduce((sum, r) => sum + r.plannedCents, 0);
      return { ...current, rows: nextRows, expensePlannedCents: newExpensePlanned };
    });
    setEditing(null);
    celebrate("Saved");

    try {
      const jobs: Promise<unknown>[] = [];
      if (nextPlanned !== editing.plannedCents) {
        jobs.push(
          api("/api/budget", {
            method: "PUT",
            body: JSON.stringify({ year: data.year, month: data.month, items: [{ categoryId: catId, plannedCents: nextPlanned }] }),
          }),
        );
      }
      if (catName.trim() && catName.trim() !== editing.category.name) {
        jobs.push(api("/api/categories", { method: "PATCH", body: JSON.stringify({ id: catId, name: catName.trim() }) }));
      }
      await Promise.all(jobs);
      load();
    } catch {
      load();
    }
  }

  async function reassign(tx: MonthTx, nextId: string) {
    await api(`/api/transactions/${tx.id}`, { method: "PATCH", body: JSON.stringify({ categoryId: nextId, reviewed: true }) });
    setTxs((current) => (current ?? []).filter((row) => row.id !== tx.id));
    setMoving(null);
    load();
  }

  async function removeCategory() {
    if (!editing) return;
    await api("/api/categories", { method: "DELETE", body: JSON.stringify({ id: editing.category.id, entity: "category" }) });
    setEditing(null);
    setConfirmDelete(false);
    load();
  }

  function openRow(row: BudgetRow) {
    setEditing(row);
    setPlanned((row.plannedCents / 100).toFixed(0));
    setCatName(row.category.name);
    setMoving(null);
    setConfirmDelete(false);

    const cachedCats = peek<{ groups: { name: string; categories: { id: string; name: string }[] }[] }>("/api/categories");
    if (cachedCats?.groups) {
      setCatGroups(cachedCats.groups);
    } else {
      void read<{ groups: { name: string; categories: { id: string; name: string }[] }[] }>("/api/categories")
        .then((res) => setCatGroups(res.groups))
        .catch(() => undefined);
    }

    if (!data) {
      setTxs([]);
      return;
    }
    const range = monthRange(data.year, data.month);
    const txPath = `/api/transactions?categoryId=${row.category.id}&start=${range.start}&end=${range.end}`;
    const cachedTxs = peek<{ transactions: MonthTx[] }>(txPath);
    if (cachedTxs?.transactions) {
      setTxs(cachedTxs.transactions);
    } else {
      setTxs(null);
    }
    void read<{ transactions: MonthTx[] }>(txPath)
      .then((res) => setTxs(res.transactions))
      .catch(() => setTxs([]));
  }

  async function openAdd() {
    const res = await api<{ groups: { id: string; name: string }[] }>("/api/categories");
    setGroupsList(res.groups);
    setPlanOpen(false);
    setAdding({ groupId: res.groups[0]?.id ?? "", name: "" });
  }

  const plannedTotal = data?.expensePlannedCents ?? 0;
  const hasPlan = plannedTotal > 0;
  const left = plannedTotal - (data?.expenseSpentCents ?? 0);
  const over = hasPlan && left < 0;

  return (
    <>
      <Screen
        title="Plan"
        framed
        onRefresh={load}
        action={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <MonthNav
              year={cursor.year}
              month={cursor.month}
              compact
              onChange={(year, month) => setCursor({ year, month })}
            />
            <GlassIconButton
              icon="flag"
              label="Set target"
              size={34}
              iconSize={15}
              onPress={() => setPlanOpen(true)}
            />
            <GlassIconButton
              icon="plus"
              label="Add category"
              size={34}
              iconSize={16}
              onPress={() => void openAdd()}
            />
          </View>
        }
      >
        {error ? <Note>{error}</Note> : null}
        {!data && !error ? <Loading /> : null}
        {data ? (
          <>
            {/* iOS Health Style Monthly Budget Tile */}
            <Pressable
              onPress={() => {
                tapPress();
                setPlanOpen(true);
              }}
              style={({ pressed }) => [
                {
                  backgroundColor: colors.card,
                  borderRadius: 22,
                  borderCurve: "continuous",
                  borderWidth: 1,
                  borderColor: colors.line,
                  padding: 18,
                  gap: 12,
                  shadowColor: "#000",
                  shadowOpacity: colors.scheme === "dark" ? 0.28 : 0.04,
                  shadowRadius: 16,
                  shadowOffset: { width: 0, height: 5 },
                  elevation: 3,
                },
                pressed ? { opacity: 0.9, transform: [{ scale: 0.985 }] } : null,
              ]}
            >
              {/* Tile Header: Eyebrow + Status Badge */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Icon name="chart" size={14} color={colors.accentInk} />
                  <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.6, color: colors.muted, textTransform: "uppercase" }}>
                    {hasPlan ? "Monthly Budget" : "Spending So Far"}
                  </Text>
                </View>
                {hasPlan ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 5,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 99,
                      borderCurve: "continuous",
                      backgroundColor:
                        over
                          ? colors.scheme === "dark"
                            ? "rgba(255, 107, 74, 0.16)"
                            : "rgba(217, 74, 46, 0.12)"
                          : colors.scheme === "dark"
                            ? "rgba(61, 190, 154, 0.16)"
                            : "rgba(27, 122, 98, 0.12)",
                    }}
                  >
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: over ? colors.danger : colors.positive,
                      }}
                    />
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "700",
                        letterSpacing: -0.1,
                        color: over ? colors.danger : colors.positive,
                      }}
                    >
                      {over ? "Over Budget" : "On Track"}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Primary Value */}
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                <Text
                  style={{
                    fontSize: 38,
                    fontWeight: "700",
                    letterSpacing: -1.4,
                    color: over ? colors.danger : colors.ink,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {hasPlan ? (over ? `-${money(Math.abs(left))}` : money(left)) : money(data.expenseSpentCents ?? 0)}
                </Text>
                <Text style={{ fontSize: 16, fontWeight: "500", color: colors.muted }}>
                  {hasPlan ? (over ? "over budget" : "left to spend") : "spent"}
                </Text>
              </View>

              {/* Visual Progress Bar */}
              {hasPlan ? (
                <View style={{ gap: 6 }}>
                  <Progress
                    value={data.expenseSpentCents}
                    max={plannedTotal}
                    color={over ? colors.danger : colors.accent}
                  />
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ fontSize: 12, color: colors.muted, fontVariant: ["tabular-nums"] }}>
                      {`Spent ${money(data.expenseSpentCents)} of ${money(plannedTotal)}`}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.muted, fontVariant: ["tabular-nums"] }}>
                      {`${Math.round((data.expenseSpentCents / (plannedTotal || 1)) * 100)}% spent`}
                    </Text>
                  </View>
                </View>
              ) : null}
            </Pressable>

            {visibleGroups.map((group) => {
              const available = group.rows.reduce((sum, row) => sum + row.availableCents, 0);
              const spent = group.rows.reduce((sum, row) => sum + row.spentCents, 0);
              const isClosed = closed[group.id] ?? false;
              const color = shelfColor(group.color);
              return (
                <View key={group.id} style={{ gap: 8 }}>
                  <Pressable
                    onPress={() => {
                      tapSelect();
                      setClosed({ ...closed, [group.id]: !isClosed });
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingVertical: 2,
                      paddingHorizontal: 2,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "500", color: colors.muted, letterSpacing: -0.1 }}>
                      {group.name}
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: "500", color: colors.muted, fontVariant: ["tabular-nums"] }}>
                      {available > 0 ? `${money(spent)} / ${money(available)}` : money(spent)}
                    </Text>
                  </Pressable>
                  {isClosed ? null : (
                    <Card>
                      {group.rows.map((row, index) => {
                        const paced = row.availableCents > 0;
                        const rowOver = paced && row.remainingCents < 0;
                        const figure = paced ? Math.abs(row.remainingCents) : row.spentCents;

                        return (
                          <Pressable
                            key={row.category.id}
                            onPress={() => openRow(row)}
                            onPressIn={tapPress}
                            style={({ pressed }) => [
                              { paddingHorizontal: 16, paddingVertical: 12, gap: 8, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line },
                              pressed ? { backgroundColor: colors.fill } : null,
                            ]}
                          >
                            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                              <View style={{ flex: 1, gap: 4 }}>
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
                                  <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: "500", color: colors.ink }}>
                                    {row.category.name}
                                  </Text>
                                </View>
                                {paced ? (
                                  <Text style={{ paddingLeft: 16, fontSize: 13, color: colors.muted }}>
                                    {money(row.spentCents)} of {money(row.availableCents)}
                                  </Text>
                                ) : null}
                              </View>
                              <View style={{ alignItems: "flex-end", gap: 2 }}>
                                {paced ? (
                                  <Text style={{ fontSize: 12, fontWeight: "500", color: rowOver ? colors.danger : colors.tertiary }}>
                                    {rowOver ? "Over" : "Left"}
                                  </Text>
                                ) : null}
                                <Text style={{ fontSize: 16, fontWeight: "600", color: rowOver ? colors.danger : colors.ink }}>{money(figure)}</Text>
                              </View>
                            </View>
                            {paced ? (
                              <Progress
                                value={row.spentCents}
                                max={row.availableCents}
                                color={rowOver ? colors.danger : color}
                              />
                            ) : null}
                          </Pressable>
                        );
                      })}
                    </Card>
                  )}
                </View>
              );
            })}

            <Pressable
              onPress={() => void openAdd()}
              style={({ pressed }) => [
                {
                  marginTop: 8,
                  marginBottom: 12,
                  paddingVertical: 14,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: colors.line,
                  borderStyle: "dashed",
                  backgroundColor: colors.card,
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "row",
                  gap: 8,
                },
                pressed ? { backgroundColor: colors.fill } : null,
              ]}
            >
              <Icon name="plus" size={16} color={colors.accentInk} />
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.accentInk }}>New Category</Text>
            </Pressable>

            {hiddenCount > 0 ? (
              <Pressable onPress={() => setShowUnused((value) => !value)} style={{ paddingVertical: 8, alignItems: "center" }}>
                <Text style={{ color: colors.accentInk, fontWeight: "600", fontSize: 15 }}>
                  {showUnused ? "Hide other categories" : `Show ${hiddenCount} other ${hiddenCount === 1 ? "category" : "categories"}`}
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </Screen>

      {planOpen && data ? (
        <Sheet
          title="Monthly Target"
          onClose={() => setPlanOpen(false)}
        >
          {/* Allocation Health Card */}
          <Card tone="inset">
            <View style={{ padding: 16, gap: 14 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Allocation Overview
                </Text>
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 6,
                    backgroundColor: data.leftoverCents < 0 ? "rgba(217, 74, 46, 0.12)" : data.leftoverCents === 0 ? "rgba(27, 122, 98, 0.12)" : colors.fill,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: data.leftoverCents < 0 ? colors.danger : data.leftoverCents === 0 ? colors.positive : colors.ink,
                    }}
                  >
                    {data.leftoverCents < 0 ? "Over allocated" : data.leftoverCents === 0 ? "Fully assigned" : "Unassigned buffer"}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <View style={{ gap: 2 }}>
                  <Text style={{ fontSize: 12, color: colors.tertiary }}>Planned Income</Text>
                  <Text style={{ fontSize: 17, fontWeight: "600", color: colors.ink }}>
                    {money(Math.round(Number(income || 0) * 100))}
                  </Text>
                </View>
                <View style={{ gap: 2, alignItems: "center" }}>
                  <Text style={{ fontSize: 12, color: colors.tertiary }}>Category Budgets</Text>
                  <Text style={{ fontSize: 17, fontWeight: "600", color: colors.ink }}>
                    {money(plannedTotal)}
                  </Text>
                </View>
                <View style={{ gap: 2, alignItems: "flex-end" }}>
                  <Text style={{ fontSize: 12, color: colors.tertiary }}>Left to Assign</Text>
                  <Text
                    style={{
                      fontSize: 17,
                      fontWeight: "700",
                      color: data.leftoverCents < 0 ? colors.danger : data.leftoverCents === 0 ? colors.positive : colors.accentInk,
                    }}
                  >
                    {money(data.leftoverCents)}
                  </Text>
                </View>
              </View>
            </View>
          </Card>

          <Section title="Edit expected income" />
          <Card tone="inset">
            <View style={{ padding: 14, gap: 12 }}>
              <Field
                label="Planned monthly income ($)"
                value={income}
                onChangeText={setIncome}
                keyboardType="decimal-pad"
                placeholder="5000"
              />
              <Button
                label="Save income target"
                block
                onPress={() => void saveIncome().then(() => setPlanOpen(false))}
              />
            </View>
          </Card>
        </Sheet>
      ) : null}

      {editing && data ? (
        (() => {
          const paced = editing.availableCents > 0;
          const rowOver = paced && editing.remainingCents < 0;
          const figure = paced ? Math.abs(editing.remainingCents) : editing.spentCents;
          const color = shelfColor(editing.group?.color ?? "#8B939E");
          const txCount = txs ? txs.length : 0;
          const txTotal = txs ? txs.reduce((sum, t) => sum + t.amountCents, 0) : 0;

          return (
            <Sheet
              title={catName || editing.category.name}
              height="80%"
              onClose={() => setEditing(null)}
            >
              {/* Category Performance Card */}
              <Card tone="inset">
                <View style={{ padding: 16, gap: 12 }}>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <View style={{ gap: 2 }}>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                        Total Spent
                      </Text>
                      <Text style={{ fontSize: 32, fontWeight: "700", color: colors.ink, letterSpacing: -1, fontVariant: ["tabular-nums"] }}>
                        {money(editing.spentCents)}
                      </Text>
                    </View>
                    {paced ? (
                      <View
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 8,
                          backgroundColor: rowOver ? "rgba(217, 74, 46, 0.12)" : "rgba(27, 122, 98, 0.12)",
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: "700", color: rowOver ? colors.danger : colors.positive }}>
                          {rowOver ? `${money(figure)} over` : `${money(figure)} left`}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {paced ? (
                    <Progress
                      value={editing.spentCents}
                      max={editing.availableCents}
                      color={rowOver ? colors.danger : color}
                    />
                  ) : null}

                  <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.line }}>
                    <View style={{ gap: 2 }}>
                      <Text style={{ fontSize: 11, fontWeight: "500", color: colors.tertiary }}>Spent</Text>
                      <Text style={{ fontSize: 15, fontWeight: "600", color: colors.ink }}>{money(editing.spentCents)}</Text>
                    </View>
                    <View style={{ gap: 2, alignItems: "center" }}>
                      <Text style={{ fontSize: 11, fontWeight: "500", color: colors.tertiary }}>Budget</Text>
                      <Text style={{ fontSize: 15, fontWeight: "600", color: colors.ink }}>{money(editing.plannedCents)}</Text>
                    </View>
                    <View style={{ gap: 2, alignItems: "flex-end" }}>
                      <Text style={{ fontSize: 11, fontWeight: "500", color: colors.tertiary }}>{rowOver ? "Over Budget" : "Remaining"}</Text>
                      <Text style={{ fontSize: 15, fontWeight: "600", color: rowOver ? colors.danger : colors.positive }}>
                        {money(figure)}
                      </Text>
                    </View>
                  </View>
                </View>
              </Card>

              {/* Transactions Section */}
              <Section
                title={txs ? `Charges this month (${txCount})` : "Charges this month"}
                trailing={txs && txCount > 0 ? money(txTotal) : undefined}
              />
              {txs == null ? (
                <Card tone="inset">
                  <View style={{ paddingHorizontal: 16 }}>
                    <InlineLoading count={2} />
                  </View>
                </Card>
              ) : null}
              {txs && txCount === 0 ? (
                <Card tone="inset">
                  <View style={{ padding: 20, alignItems: "center" }}>
                    <Text style={{ color: colors.muted, fontSize: 14 }}>
                      No charges in this category for {monthLabel(data.year, data.month)}.
                    </Text>
                  </View>
                </Card>
              ) : null}
              {txs && txCount > 0 ? (
                <Card tone="inset">
                  {txs.map((tx, index) => {
                    const flow = flowMoney(tx.amountCents);
                    return (
                      <View key={tx.id} style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                          <View style={{ flex: 1 }}>
                            <Text numberOfLines={1} style={{ fontWeight: "500", color: colors.ink }}>{tx.merchantName || tx.name}</Text>
                            <Text style={{ fontSize: 13, color: colors.muted }}>{dayLabel(tx.date)}</Text>
                          </View>
                          <Text style={{ fontWeight: "600", color: flow.color }}>{flow.text}</Text>
                        </View>
                        <Pressable onPress={() => setMoving(moving === tx.id ? null : tx.id)}>
                          <Text style={{ color: colors.accentInk, fontWeight: "600" }}>{moving === tx.id ? "Close" : "Move"}</Text>
                        </Pressable>
                        {moving === tx.id
                          ? catGroups.map((group) => (
                              <View key={group.name} style={{ gap: 4 }}>
                                <Text style={{ fontSize: 12, color: colors.muted }}>{group.name}</Text>
                                {group.categories.map((category) => (
                                  <Pressable key={category.id} onPress={() => void reassign(tx, category.id)}>
                                    <Text style={{ fontSize: 16, paddingVertical: 4, color: category.id === editing.category.id ? colors.accentInk : colors.ink }}>{category.name}</Text>
                                  </Pressable>
                                ))}
                              </View>
                            ))
                          : null}
                      </View>
                    );
                  })}
                </Card>
              ) : null}

              {/* Edit Budget & Details */}
              <Section title="Budget & name" />
              <Card tone="inset">
                <View style={{ padding: 14, gap: 12 }}>
                  <Field label="Monthly budget ($)" value={planned} onChangeText={setPlanned} keyboardType="decimal-pad" />
                  <Field label="Category name" value={catName} onChangeText={setCatName} />
                  <Button label="Save changes" block onPress={() => void saveCategory()} />
                </View>
              </Card>

              <Pressable
                onPress={() => {
                  if (!confirmDelete) {
                    setConfirmDelete(true);
                    return;
                  }
                  void removeCategory();
                }}
                style={{ alignItems: "center", paddingVertical: 10 }}
              >
                <Text style={{ color: confirmDelete ? colors.danger : colors.muted, fontWeight: "500", fontSize: 14 }}>
                  {confirmDelete ? "Tap again to permanently delete" : "Delete category"}
                </Text>
              </Pressable>
            </Sheet>
          );
        })()
      ) : null}

      {adding ? (
        <Sheet title="New category" onClose={() => setAdding(null)}>
          <Section title="Select group" />
          <Card tone="inset">
            {groupsList.map((group, index) => (
              <Pressable
                key={group.id}
                onPress={() => setAdding({ ...adding, groupId: group.id })}
                style={({ pressed }) => [
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: colors.line,
                  },
                  pressed ? { backgroundColor: colors.fill } : null,
                ]}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: adding.groupId === group.id ? "600" : "400",
                    color: adding.groupId === group.id ? colors.accentInk : colors.ink,
                  }}
                >
                  {group.name}
                </Text>
                {adding.groupId === group.id ? (
                  <Icon name="check" size={16} color={colors.accentInk} />
                ) : null}
              </Pressable>
            ))}
          </Card>
          <Field label="Category name" value={adding.name} onChangeText={(name) => setAdding({ ...adding, name })} placeholder="e.g. Groceries, Gym" />
          <Button
            label="Add category"
            block
            onPress={() =>
              void api("/api/categories", {
                method: "POST",
                body: JSON.stringify({ groupId: adding.groupId, name: adding.name, flexBucket: "fixed" }),
              }).then(() => {
                setAdding(null);
                load();
              })
            }
          />
        </Sheet>
      ) : null}
    </>
  );
}
