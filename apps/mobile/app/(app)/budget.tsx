import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Animated, Pressable, Text, View } from "react-native";
import { api, load as read, peek, subscribeCache } from "../../src/api";
import { budgetPace, dayLabel, flowMoney, money, monthFraction, monthLabel, monthRange, shelfColor, shortMonthLabel } from "../../src/format";
import { tapPress, tapSelect } from "../../src/haptic";
import { mergeBudget, subscribeLive } from "../../src/live-edits";
import { celebrate } from "../../src/toast";
import { Button, Card, colors, Facts, Field, GlassIconButton, Hero, InlineLoading, LoadError, Loading, MonthNav, Progress, ProgressRing, RollingFigure, Screen, Section, Sheet } from "../../src/ui";
import { useReduceMotion } from "../../src/theme";
import { anchorRect, barsOpacity, playFlight, setCategoryReturn, stageFlight, useFlightArrival, useFlightHidden, useMeasuredAnchor, type FlightPiece, type FlightRect } from "../../src/flight";
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

function budgetAgrees(server: Budget, local: Budget) {
  if (server.plannedIncomeCents !== local.plannedIncomeCents) return false;
  return local.rows.every((row) => {
    const other = server.rows.find((item) => item.category.id === row.category.id);
    return Boolean(other && other.plannedCents === row.plannedCents && other.category.name === row.category.name);
  });
}

export default function BudgetScreen() {
  const params = useLocalSearchParams<{ categoryId?: string }>();
  const openedCategory = useRef<string | null>(null);
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
  const [actionError, setActionError] = useState<{ message: string; retry: () => void } | null>(null);
  const [liveTick, setLiveTick] = useState(0);
  const [overlayTick, setOverlayTick] = useState(0);
  const planEpoch = useRef(0);
  const overlay = useRef<Budget | null>(null);
  const reduceMotion = useReduceMotion();
  const [figureSeed, setFigureSeed] = useState<string | null>(null);
  const [rowOrigin, setRowOrigin] = useState<FlightRect | null>(null);
  const [sheetCarry, setSheetCarry] = useState<FlightPiece[] | null>(null);
  const figureTextRef = useRef("");
  useFlightArrival("left-to-plan", reduceMotion, (flight) => {
    const carried = flight.pieces[0]?.text;
    flight.onDone = () => {
      if (reduceMotion) return;
      const real = figureTextRef.current;
      if (!carried || carried === real) return;
      setFigureSeed(carried);
      setTimeout(() => setFigureSeed(null), 32);
    };
  });
  const monthSlide = useRef(new Animated.Value(0)).current;
  const monthFade = useRef(new Animated.Value(1)).current;
  const monthDir = useRef(0);

  function changeMonth(year: number, month: number) {
    const next = year * 12 + month;
    const prev = cursor.year * 12 + cursor.month;
    monthDir.current = next === prev ? 0 : next > prev ? 1 : -1;
    setCursor({ year, month });
  }

  useEffect(() => {
    const dir = monthDir.current;
    if (!dir) return;
    monthDir.current = 0;
    if (reduceMotion) {
      monthSlide.setValue(0);
      monthFade.setValue(1);
      return;
    }
    monthSlide.setValue(dir * 36);
    monthFade.setValue(0.35);
    Animated.parallel([
      Animated.spring(monthSlide, { toValue: 0, useNativeDriver: true, stiffness: 320, damping: 28, mass: 0.72 }),
      Animated.timing(monthFade, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [cursor.year, cursor.month, reduceMotion, monthSlide, monthFade]);

  const budgetPath = `/api/budget?year=${cursor.year}&month=${cursor.month}`;

  const load = useCallback(() => {
    const started = planEpoch.current;
    return read<Budget>(budgetPath)
      .then((next) => {
        if (started !== planEpoch.current) return;
        setData(next);
        if (!overlay.current) setIncome((Number(next.plannedIncomeCents) / 100).toFixed(0));
        if (overlay.current && budgetAgrees(next, overlay.current)) {
          overlay.current = null;
          setOverlayTick((value) => value + 1);
        }
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load the plan"));
  }, [budgetPath]);

  useEffect(() => subscribeLive(() => setLiveTick((value) => value + 1)), []);
  useEffect(() => {
    return subscribeCache<Budget>(budgetPath, (next) => {
      if (!next) return;
      setData(next);
      if (overlay.current && budgetAgrees(next, overlay.current)) {
        overlay.current = null;
        setOverlayTick((value) => value + 1);
      }
    });
  }, [budgetPath]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const plan = useMemo(() => {
    const base = overlay.current ?? data;
    return base ? mergeBudget(base) : null;
  }, [data, liveTick, overlayTick]);

  const groups = useMemo(() => {
    if (!plan) return [];
    const map = new Map<string, { id: string; name: string; color: string; sortOrder: number; rows: BudgetRow[] }>();
    for (const row of plan.rows) {
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
  }, [plan]);

  const quiet = (row: BudgetRow) => row.spentCents <= 0 && row.availableCents <= 0 && (row.rolloverInCents ?? 0) <= 0;
  const hiddenCount = groups.reduce((sum, group) => sum + group.rows.filter(quiet).length, 0);
  const visibleGroups = showUnused
    ? groups
    : groups.map((group) => ({ ...group, rows: group.rows.filter((row) => !quiet(row)) })).filter((group) => group.rows.length > 0);

  function saveIncome() {
    if (!data) return;
    const snapshot = data;
    const plannedIncomeCents = Math.round(Number(income || 0) * 100);
    const next = { ...data, plannedIncomeCents, leftoverCents: plannedIncomeCents - data.expensePlannedCents };
    planEpoch.current += 1;
    overlay.current = next;
    setOverlayTick((value) => value + 1);
    setData(next);
    setPlanOpen(false);
    setActionError(null);
    const retry = () => saveIncome();
    void api("/api/budget", {
      method: "PUT",
      body: JSON.stringify({ year: data.year, month: data.month, plannedIncomeCents }),
    })
      .then(() => load())
      .catch(() => {
        planEpoch.current += 1;
        overlay.current = null;
        setData(snapshot);
        setIncome((snapshot.plannedIncomeCents / 100).toFixed(0));
        setOverlayTick((value) => value + 1);
        setPlanOpen(true);
        setActionError({ message: "Could not save that income.", retry });
      });
  }

  function saveCategory() {
    if (!data || !editing) return;
    const snapshot = data;
    const nextPlanned = Math.round(Number(planned || 0) * 100);
    const catId = editing.category.id;
    const nextName = catName.trim() || editing.category.name;
    const nextRows = data.rows.map((row) => {
      if (row.category.id !== catId) return row;
      const availableCents = nextPlanned + (row.rolloverInCents ?? 0);
      return {
        ...row,
        plannedCents: nextPlanned,
        availableCents,
        remainingCents: availableCents - row.spentCents,
        category: { ...row.category, name: nextName },
      };
    });
    const expensePlannedCents = nextRows.reduce((sum, row) => sum + row.availableCents, 0);
    const next = { ...data, rows: nextRows, expensePlannedCents, leftoverCents: data.plannedIncomeCents - expensePlannedCents };
    planEpoch.current += 1;
    overlay.current = next;
    setOverlayTick((value) => value + 1);
    setData(next);
    setEditing(null);
    setActionError(null);
    celebrate("Saved");
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
    const retry = () => {
      setPlanned((nextPlanned / 100).toFixed(0));
      setCatName(nextName);
      setEditing(editing);
      saveCategory();
    };
    void Promise.all(jobs)
      .then(() => load())
      .catch(() => {
        planEpoch.current += 1;
        overlay.current = null;
        setData(snapshot);
        setOverlayTick((value) => value + 1);
        setActionError({ message: "Could not save that amount.", retry });
      });
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

  useEffect(() => {
    const id = typeof params.categoryId === "string" ? params.categoryId : "";
    if (!id || !plan || openedCategory.current === id) return;
    const row = plan.rows.find((item) => item.category.id === id);
    if (!row) return;
    openedCategory.current = id;
    openRow(row);
  }, [params.categoryId, plan]);

  function openRow(row: BudgetRow) {
    const origin = anchorRect(`plan.row.${row.category.id}`);
    const figureFrom = anchorRect(`plan.figure.${row.category.id}`);
    const barFrom = anchorRect(`plan.bar.${row.category.id}`);
    setRowOrigin(origin);
    const pacedRow = row.availableCents > 0;
    const rowPace = pacedRow ? budgetPace(row.spentCents, row.availableCents) : null;
    const rowOver = pacedRow && row.remainingCents < 0;
    const figure = rowPace ? rowPace.gapCents : row.spentCents;
    const figureColor = rowPace
      ? rowPace.tone === "bad"
        ? colors.danger
        : rowPace.tone === "warn"
          ? colors.warn
          : colors.positive
      : rowOver
        ? colors.danger
        : colors.ink;
    const carry: FlightPiece[] = [];
    if (figureFrom) {
      carry.push({
        key: "figure",
        text: money(figure),
        color: figureColor,
        fontSize: 16,
        fontWeight: "700",
        from: figureFrom,
        toAnchor: "plan.sheet.figure",
        toFontSize: 13,
      });
    }
    if (barFrom) {
      carry.push({
        key: "bar",
        kind: "fill",
        color: shelfColor(row.group?.color ?? "#8B939E"),
        fontSize: 8,
        from: barFrom,
        toAnchor: "plan.sheet.color",
      });
    }
    if (origin) {
      carry.push({
        key: "name",
        text: row.category.name,
        color: colors.ink,
        fontSize: 16,
        fontWeight: "600",
        from: origin,
        toAnchor: "plan.sheet.title",
        toFontSize: 20,
      });
      setCategoryReturn(`plan.bar.${row.category.id}`, barFrom ?? origin);
    }
    setSheetCarry(carry);
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

  const plannedTotal = plan?.expensePlannedCents ?? 0;
  const hasPlan = plannedTotal > 0;
  const left = plannedTotal - (plan?.expenseSpentCents ?? 0);
  const over = hasPlan && left < 0;
  const pace = budgetPace(plan?.expenseSpentCents ?? 0, plannedTotal);
  const paceColor = pace.tone === "bad" ? colors.danger : pace.tone === "warn" ? colors.warn : colors.positive;
  const typedIncomeCents = Math.round(Number(income || 0) * 100);
  const leftToAssign = typedIncomeCents - plannedTotal;
  const tileText = hasPlan ? (over ? `-${money(Math.abs(left))}` : money(left)) : money(plan?.expenseSpentCents ?? 0);
  figureTextRef.current = tileText;
  const planLeft = useMeasuredAnchor("plan.left", { text: tileText, color: over ? colors.danger : colors.ink, fontSize: 38 });
  const planLeftHidden = useFlightHidden("plan.left");

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
              onChange={changeMonth}
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
        {error ? <LoadError message={error} onRetry={() => void load()} /> : null}
        {actionError ? <LoadError message={actionError.message} onRetry={actionError.retry} /> : null}
        {!plan && !error ? <Loading /> : null}
        {plan ? (
          <Animated.View style={{ gap: 20, opacity: monthFade, transform: [{ translateX: monthSlide }] }}>
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
                        pace.tone === "bad"
                          ? colors.scheme === "dark"
                            ? "rgba(255, 107, 74, 0.16)"
                            : "rgba(217, 74, 46, 0.12)"
                          : pace.tone === "warn"
                            ? colors.scheme === "dark"
                              ? "rgba(224, 161, 90, 0.16)"
                              : "rgba(196, 122, 26, 0.12)"
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
                        backgroundColor: paceColor,
                      }}
                    />
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "700",
                        letterSpacing: -0.1,
                        color: paceColor,
                      }}
                    >
                      {pace.label}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Amount stays whole. The caption sits under it and can wrap. */}
              <View style={{ alignSelf: "stretch" }}>
                <View ref={planLeft.ref} onLayout={planLeft.onLayout} collapsable={false} style={{ alignSelf: "flex-start", flexShrink: 0, opacity: planLeftHidden }}>
                  <RollingFigure
                    text={figureSeed ?? tileText}
                    style={{
                      fontSize: 38,
                      fontWeight: "700",
                      letterSpacing: -1.4,
                      color: over ? colors.danger : colors.ink,
                      fontVariant: ["tabular-nums"],
                    }}
                  />
                </View>
                <Text style={{ marginTop: 2, fontSize: 16, fontWeight: "500", color: colors.muted }}>
                  {hasPlan ? (over ? "over budget" : "left to spend") : "spent"}
                </Text>
              </View>
              <Text style={{ fontSize: 13, color: plan.leftoverCents < 0 ? colors.danger : colors.muted, fontVariant: ["tabular-nums"] }}>
                {`Left to assign ${money(plan.leftoverCents)}`}
              </Text>

              {/* Visual Progress Bar */}
              {hasPlan ? (
                <View style={{ gap: 6 }}>
                  <Progress
                    value={plan.expenseSpentCents}
                    max={plannedTotal}
                    color={pace.tone === "bad" ? colors.danger : pace.tone === "warn" ? colors.warn : colors.accent}
                  />
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ fontSize: 12, color: colors.muted, fontVariant: ["tabular-nums"] }}>
                      {`Spent ${money(plan.expenseSpentCents)} of ${money(plannedTotal)}`}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.muted, fontVariant: ["tabular-nums"] }}>
                      {`${Math.round((plan.expenseSpentCents / (plannedTotal || 1)) * 100)}% spent`}
                    </Text>
                  </View>
                </View>
              ) : null}
            </Pressable>

            <Animated.View style={{ gap: 20, opacity: barsOpacity }}>
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
                        const rowPace = paced ? budgetPace(row.spentCents, row.availableCents) : null;
                        const rowPaceColor = rowPace?.tone === "bad" ? colors.danger : rowPace?.tone === "warn" ? colors.warn : colors.positive;
                        const rowOver = paced && row.remainingCents < 0;
                        const figure = rowPace ? rowPace.gapCents : row.spentCents;

                        return (
                          <AnchorBox key={row.category.id} id={`plan.row.${row.category.id}`}>
                          <Pressable
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
                              <View style={{ alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                                {rowPace ? (
                                  <Text style={{ fontSize: 12, fontWeight: "700", color: rowPaceColor }}>
                                    {rowPace.label}
                                  </Text>
                                ) : null}
                                <AnchorBox id={`plan.figure.${row.category.id}`}>
                                  <Text style={{ fontSize: 16, fontWeight: "600", color: rowPace ? rowPaceColor : colors.ink }}>{money(figure)}</Text>
                                </AnchorBox>
                              </View>
                            </View>
                            {paced ? (
                              <AnchorBox id={`plan.bar.${row.category.id}`}>
                                <Progress
                                  value={row.spentCents}
                                  max={row.availableCents}
                                  color={rowOver ? colors.danger : color}
                                  markerRatio={monthFraction()}
                                />
                              </AnchorBox>
                            ) : null}
                          </Pressable>
                          </AnchorBox>
                        );
                      })}
                    </Card>
                  )}
                </View>
              );
            })}
            </Animated.View>

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
          </Animated.View>
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
                    backgroundColor: leftToAssign < 0 ? "rgba(217, 74, 46, 0.12)" : leftToAssign === 0 ? "rgba(27, 122, 98, 0.12)" : colors.fill,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: leftToAssign < 0 ? colors.danger : leftToAssign === 0 ? colors.positive : colors.ink,
                    }}
                  >
                    {leftToAssign < 0 ? "Over allocated" : leftToAssign === 0 ? "Fully assigned" : "Unassigned buffer"}
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
                  <Text style={{ fontSize: 12, color: colors.tertiary }}>Assigned</Text>
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
                      color: leftToAssign < 0 ? colors.danger : leftToAssign === 0 ? colors.positive : colors.accentInk,
                    }}
                  >
                    {money(leftToAssign)}
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
                onPress={saveIncome}
              />
            </View>
          </Card>
        </Sheet>
      ) : null}

      {editing && data ? (
        (() => {
          const paced = editing.availableCents > 0;
          const rowPace = paced ? budgetPace(editing.spentCents, editing.availableCents) : null;
          const rowPaceColor = rowPace?.tone === "bad" ? colors.danger : rowPace?.tone === "warn" ? colors.warn : colors.positive;
          const rowOver = paced && editing.remainingCents < 0;
          const paceGap = rowPace ? rowPace.gapCents : 0;
          const figure = paced ? Math.abs(editing.remainingCents) : editing.spentCents;
          const color = shelfColor(editing.group?.color ?? "#8B939E");
          const txCount = txs ? txs.length : 0;
          const txTotal = txs ? txs.reduce((sum, t) => sum + t.amountCents, 0) : 0;

          return (
            <Sheet
              title={catName || editing.category.name}
              subtitle={rowPace?.label}
              subtitleColor={rowPace ? rowPaceColor : undefined}
              height="80%"
              origin={rowOrigin}
              originAnchor={`plan.row.${editing.category.id}`}
              carry={sheetCarry}
              titleAnchor="plan.sheet.title"
              onClose={() => {
                setEditing(null);
                setSheetCarry(null);
              }}
            >
              <AnchorBox id="plan.sheet.color">
                <View style={{ height: 8, borderRadius: 99, backgroundColor: color }} />
              </AnchorBox>
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
                          backgroundColor:
                            rowPace?.tone === "bad"
                              ? "rgba(217, 74, 46, 0.12)"
                              : rowPace?.tone === "warn"
                                ? "rgba(196, 122, 26, 0.12)"
                                : "rgba(27, 122, 98, 0.12)",
                        }}
                      >
                        <AnchorBox id="plan.sheet.figure">
                          <Text style={{ fontSize: 13, fontWeight: "700", color: rowPace ? rowPaceColor : colors.ink }}>
                            {rowPace ? money(paceGap) : money(figure)}
                          </Text>
                        </AnchorBox>
                      </View>
                    ) : null}
                  </View>

                  {paced ? (
                    <Progress
                      value={editing.spentCents}
                      max={editing.availableCents}
                      color={rowOver ? colors.danger : color}
                      markerRatio={monthFraction()}
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

function AnchorBox({ id, children }: { id: string; children: ReactNode }) {
  const measure = useMeasuredAnchor(id);
  return (
    <View ref={measure.ref} onLayout={measure.onLayout} collapsable={false}>
      {children}
    </View>
  );
}
