import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api, load as read, peek } from "../../src/api";
import { dayLabel, daysLeftInMonth, flowMoney, money, monthLabel, monthRange, shelfColor } from "../../src/format";
import { tapSelect } from "../../src/haptic";
import { celebrate } from "../../src/toast";
import { Button, Card, colors, Facts, Field, Hero, Loading, MonthNav, Note, Progress, Screen, Section, Sheet, SpringPressable } from "../../src/ui";

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
    setTxs(null);
    setMoving(null);
    setConfirmDelete(false);
    void api<{ groups: { name: string; categories: { id: string; name: string }[] }[] }>("/api/categories").then((res) => setCatGroups(res.groups));
    if (!data) return;
    const range = monthRange(data.year, data.month);
    void api<{ transactions: MonthTx[] }>(`/api/transactions?categoryId=${row.category.id}&start=${range.start}&end=${range.end}`).then((res) => setTxs(res.transactions));
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

  const todayDate = new Date();
  const isCurrentMonth = cursor.year === todayDate.getFullYear() && cursor.month === todayDate.getMonth() + 1;
  const daysInMonth = new Date(cursor.year, cursor.month, 0).getDate();
  const monthDayProgress = isCurrentMonth ? Math.min(1, Math.max(0, todayDate.getDate() / daysInMonth)) : undefined;
  const daysLeft = daysLeftInMonth();
  const dailySafe = hasPlan && !over && left > 0 ? Math.round(left / daysLeft) : null;
  const budgetPct = hasPlan && plannedTotal > 0 ? Math.round(((data?.expenseSpentCents ?? 0) / plannedTotal) * 100) : 0;

  const heroStatus = hasPlan
    ? over
      ? { label: `Over by ${money(Math.abs(left))}`, tone: "bad" as const }
      : isCurrentMonth
      ? {
          label: `Day ${todayDate.getDate()} of ${daysInMonth} · ${budgetPct}% spent`,
          tone: budgetPct > (todayDate.getDate() / daysInMonth) * 100 + 10 ? ("warn" as const) : ("good" as const),
        }
      : null
    : null;

  return (
    <Screen
      title="Budget"
      framed
      onRefresh={load}
      action={
        <Pressable onPress={() => setPlanOpen(true)}>
          <Text style={{ color: colors.accentInk, fontWeight: "600", fontSize: 16 }}>Edit</Text>
        </Pressable>
      }
    >
      {data ? (
        <MonthNav year={cursor.year} month={cursor.month} label={monthLabel(cursor.year, cursor.month)} onChange={(year, month) => setCursor({ year, month })} />
      ) : null}
      {error ? <Note>{error}</Note> : null}
      {!data && !error ? <Loading /> : null}
      {data ? (
        <>
          <Hero
            label={hasPlan ? (over ? "Over this month" : "Left this month") : "Spent this month"}
            cents={hasPlan ? Math.abs(left) : data.expenseSpentCents}
            tone={hasPlan ? (over ? "bad" : "good") : undefined}
            points={hasPlan ? undefined : data.spendSeries}
            meter={hasPlan ? { value: data.expenseSpentCents, max: plannedTotal } : undefined}
            status={heroStatus}
          >
            {hasPlan ? (
              <Facts
                items={[
                  { kicker: "Spent", value: money(data.expenseSpentCents) },
                  { kicker: "Plan", value: money(plannedTotal) },
                  {
                    kicker: over ? "Over" : dailySafe != null ? "Daily safe" : "Remaining",
                    value: over ? money(Math.abs(left)) : dailySafe != null ? `${money(dailySafe)}/d` : money(left),
                    color: over ? colors.danger : colors.positive,
                  },
                ]}
              />
            ) : (
              <View style={{ paddingBottom: 16 }}>
                <Text style={{ marginTop: 8, color: colors.muted }}>No plan yet</Text>
              </View>
            )}
          </Hero>

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
                >
                  <Section
                    title={group.name}
                    trailing={available > 0 ? `${money(spent)} / ${money(available)}` : money(spent)}
                    action={isClosed ? "Show" : "Hide"}
                    onAction={() => {
                      tapSelect();
                      setClosed({ ...closed, [group.id]: !isClosed });
                    }}
                  />
                </Pressable>
                {isClosed ? null : (
                  <Card>
                    {group.rows.map((row, index) => {
                      const paced = row.availableCents > 0;
                      const rowOver = paced && row.remainingCents < 0;
                      const figure = paced ? Math.abs(row.remainingCents) : row.spentCents;
                      const spendRatio = paced && row.availableCents > 0 ? row.spentCents / row.availableCents : 0;
                      const isPacingFast = monthDayProgress != null && paced && spendRatio > monthDayProgress + 0.12 && !rowOver;

                      return (
                        <Pressable
                          key={row.category.id}
                          onPress={() => openRow(row)}
                          style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}
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
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                                  {rowOver ? (
                                    <Text style={{ fontSize: 11, fontWeight: "700", color: colors.danger, textTransform: "uppercase" }}>Over</Text>
                                  ) : isPacingFast ? (
                                    <Text style={{ fontSize: 11, fontWeight: "700", color: colors.warn, textTransform: "uppercase" }}>Fast</Text>
                                  ) : (
                                    <Text style={{ fontSize: 11, fontWeight: "600", color: colors.tertiary, textTransform: "uppercase" }}>Left</Text>
                                  )}
                                </View>
                              ) : null}
                              <Text style={{ fontSize: 16, fontWeight: "600", color: rowOver ? colors.danger : colors.ink }}>{money(figure)}</Text>
                            </View>
                          </View>
                          {paced ? (
                            <Progress
                              value={row.spentCents}
                              max={row.availableCents}
                              color={rowOver ? colors.danger : isPacingFast ? colors.warn : color}
                              markerRatio={monthDayProgress}
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

          {hiddenCount > 0 ? (
            <Pressable onPress={() => setShowUnused((value) => !value)}>
              <Text style={{ color: colors.accentInk, fontWeight: "600" }}>
                {showUnused ? "Hide other categories" : `Show ${hiddenCount} other ${hiddenCount === 1 ? "category" : "categories"}`}
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

      {planOpen ? (
        <Sheet title="Edit budget" onClose={() => setPlanOpen(false)}>
          <Field label="Planned income" value={income} onChangeText={setIncome} keyboardType="decimal-pad" />
          <Button label="Save income" onPress={() => void saveIncome().then(() => setPlanOpen(false))} />
          <Button label="Add a category" tone="quiet" onPress={() => void openAdd()} />
          {data ? <Note>{`${money(data.leftoverCents)} left to assign`}</Note> : null}
        </Sheet>
      ) : null}

      {editing && data ? (
        <Sheet title={catName || "Category"} onClose={() => setEditing(null)}>
          <Field label="Plan" value={planned} onChangeText={setPlanned} keyboardType="decimal-pad" />
          <Field label="Name" value={catName} onChangeText={setCatName} />
          <Section title="This month" />
          {txs == null ? <Loading /> : null}
          {txs && txs.length === 0 ? <Note>Nothing in this category yet.</Note> : null}
          {txs && txs.length > 0 ? (
            <Card>
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
          <Button label="Save" onPress={() => void saveCategory()} />
          <Button
            label={confirmDelete ? "Delete this category?" : "Delete"}
            tone={confirmDelete ? "danger" : "quiet"}
            onPress={() => {
              if (!confirmDelete) {
                setConfirmDelete(true);
                return;
              }
              void removeCategory();
            }}
          />
        </Sheet>
      ) : null}

      {adding ? (
        <Sheet title="New category" onClose={() => setAdding(null)}>
          <Section title="Group" />
          {groupsList.map((group) => (
            <Pressable key={group.id} onPress={() => setAdding({ ...adding, groupId: group.id })}>
              <Text style={{ fontSize: 16, paddingVertical: 8, color: adding.groupId === group.id ? colors.accentInk : colors.ink }}>{group.name}</Text>
            </Pressable>
          ))}
          <Field label="Name" value={adding.name} onChangeText={(name) => setAdding({ ...adding, name })} />
          <Button
            label="Add"
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
    </Screen>
  );
}
