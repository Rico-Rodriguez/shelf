import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { load as read, peek, subscribeCache } from "../../src/api";
import {
  billsCountedInMonth,
  billsStillDueCents,
  budgetPace,
  dashboardPath,
  dayLabel,
  expectedPaceCents,
  flowMoney,
  inDaysPhrase,
  money,
  monthRange,
  monthSaved,
  nearestOpenGoal,
  netWorthCents,
  sameMerchant,
  shelfColor,
  shortDate,
  todayISO,
  type NetWorthAccount,
} from "../../src/format";
import {
  anchorRect,
  goalPreview,
  launchLeftToPlan,
  playFlight,
  recallAnchor,
  setCategoryReturn,
  stageFlight,
  useFlightArrival,
  useFlightClock,
  useFlightHidden,
  useMeasuredAnchor,
} from "../../src/flight";
import { tapPress } from "../../src/haptic";
import { markIslandSat, onIslandSit } from "../../src/island";
import { useReduceMotion } from "../../src/theme";
import { mergeDashboard, subscribeLive } from "../../src/live-edits";
import {
  Button,
  Card,
  colors,
  Facts,
  Hero,
  LedgerRow,
  LoadError,
  Loading,
  MenuRow,
  ReviewBanner,
  Screen,
  Section,
  Sheet,
  SpendMix,
} from "../../src/ui";

type Bill = {
  id: string;
  amountCents: number;
  cadence: string;
  nextDate: string;
  isIncome: boolean;
  isActive: boolean;
};

type OpenGoal = {
  id: string;
  name: string;
  kind: string;
  targetCents: number;
  targetDate: string | null;
  progressCents: number;
  remainingCents: number;
  createdAt?: string | null;
};

type Invest = { totalCents?: number; gainCents?: number | null };

type Dash = {
  cashFlow: { incomeCents: number; spendingCents: number; savedCents: number };
  pendingCents?: number;
  budget: { plannedCents: number; spentCents: number; remainingCents: number };
  unreviewed: { count: number };
  accountCount: number;
  spendSeries?: { date: string; cents: number }[];
  recurring: { id: string; merchantName: string; amountCents: number; nextDate: string; isIncome: boolean }[];
  transactions: {
    id: string;
    name: string;
    merchantName: string | null;
    amountCents: number;
    date: string;
    pending: boolean;
    reviewed: boolean;
    hidden?: boolean;
    categoryId?: string | null;
    category: { id?: string; name: string; color: string } | null;
    account?: { name: string } | null;
  }[];
  spending?: { id: string; name: string; cents: number; color: string }[];
  suggestedSubscriptions?: { merchantName: string }[];
};

export default function HomeScreen() {
  const dashPath = dashboardPath();
  const [data, setData] = useState<Dash | null>(() => peek<Dash>(dashboardPath()) ?? null);
  const [worth, setWorth] = useState<number | null>(() => {
    const cached = peek<{ accounts: NetWorthAccount[] }>("/api/accounts");
    return cached?.accounts ? netWorthCents(cached.accounts) : null;
  });
  const [error, setError] = useState<string | null>(null);
  const [moneyOpen, setMoneyOpen] = useState(false);
  const [recurrences, setRecurrences] = useState<Bill[] | null>(() => peek<{ recurrences: Bill[] }>("/api/recurring")?.recurrences ?? null);
  const [goals, setGoals] = useState<OpenGoal[] | null>(() => peek<{ goals: OpenGoal[] }>("/api/goals")?.goals ?? null);
  const [investments, setInvestments] = useState<Invest | null>(() => peek<Invest>("/api/investments") ?? null);
  const [scrub, setScrub] = useState<{ date: string; cents: number } | null>(null);
  const [figureSeed, setFigureSeed] = useState<string | null>(null);
  const reduceMotion = useReduceMotion();
  const seenTx = useRef<Set<string> | null>(null);
  useFlightClock();
  const goalAdjust = goalPreview();

  const load = useCallback(() => {
    return Promise.all([
      read<Dash>(dashPath),
      read<{ accounts: NetWorthAccount[] }>("/api/accounts").catch(() => null),
      read<{ recurrences: Bill[] }>("/api/recurring").catch(() => null),
      read<{ goals: OpenGoal[] }>("/api/goals").catch(() => null),
      read<Invest>("/api/investments").catch(() => null),
    ])
      .then(([next, accounts, recurring, goalRows, invest]) => {
        setData(next);
        if (accounts) setWorth(netWorthCents(accounts.accounts));
        if (recurring) setRecurrences(recurring.recurrences);
        if (goalRows) setGoals(goalRows.goals);
        if (invest) setInvestments(invest);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load home"));
  }, [dashPath]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const [liveTick, setLiveTick] = useState(0);
  useEffect(() => subscribeLive(() => setLiveTick((value) => value + 1)), []);
  useEffect(() => {
    return subscribeCache<Dash>(dashPath, (next) => {
      if (next) setData(next);
    });
  }, [dashPath]);
  const shownDash = useMemo(() => (data ? mergeDashboard(data) : null), [data, liveTick]);

  const today = todayISO();
  const now = new Date();
  const range = monthRange(now.getFullYear(), now.getMonth() + 1);

  const bills = (shownDash?.recurring ?? []).filter((row) => !row.isIncome && row.nextDate >= today);
  const upcomingBillsSlice = bills.slice(0, 3);

  const categories = (shownDash?.spending ?? []).filter((row) => row.cents > 0);
  const restCents = categories.slice(4).reduce((sum, row) => sum + row.cents, 0);
  const spendRows =
    restCents > 0
      ? [...categories.slice(0, 4), { id: "rest", name: "Other categories", cents: restCents, color: "#8B939E" }]
      : categories.slice(0, 5);

  const latest = shownDash?.transactions.slice(0, 4) ?? [];
  const suggestions = shownDash?.suggestedSubscriptions?.length ?? 0;

  const totalPlannedCents = shownDash?.budget.plannedCents ?? 0;
  const spentCents = shownDash?.budget.spentCents ?? 0;
  const leftCents = totalPlannedCents - spentCents;
  const pace = budgetPace(spentCents, totalPlannedCents);
  const paceCents = expectedPaceCents(totalPlannedCents);
  const dueCents = recurrences ? billsStillDueCents(recurrences, now.getFullYear(), now.getMonth() + 1) : null;
  const afterBills = dueCents == null ? null : leftCents - dueCents;
  const pendingCents = shownDash?.pendingCents ?? 0;
  const nearest = goals
    ? nearestOpenGoal(
        goals.map((goal) => {
          if (goalAdjust?.id !== goal.id) return goal;
          const preview = Math.max(0, goalAdjust.remainingCents - goalAdjust.addedCents);
          return { ...goal, remainingCents: Math.min(goal.remainingCents, preview) };
        }),
      )
    : null;
  const saved = monthSaved(shownDash?.cashFlow.incomeCents ?? 0, shownDash?.cashFlow.spendingCents ?? 0);
  const savedCents = (shownDash?.cashFlow.incomeCents ?? 0) - (shownDash?.cashFlow.spendingCents ?? 0);
  const goalLine =
    goals == null ? null : goals.length === 0 ? "No goals" : `${money((nearest ?? goals[0]).remainingCents)} left`;
  const gainCents = investments?.gainCents ?? null;
  const marketCents = investments?.totalCents;

  const heroText = leftCents < 0 ? money(leftCents) : money(leftCents);
  useFlightArrival("plan-to-left", reduceMotion, (plan) => {
    const carried = plan.pieces[0]?.text;
    plan.onDone = () => {
      if (reduceMotion || !carried || carried === heroText) return;
      setFigureSeed(carried);
      setTimeout(() => setFigureSeed(null), 32);
    };
  });
  useFlightArrival("island-sit", reduceMotion);
  useEffect(() => {
    return onIslandSit((arrival) => {
      markIslandSat();
      const from = { x: 80, y: 6, width: 210, height: 32 };
      playFlight(
        {
          id: "island-sit",
          hide: [`today.tx.${arrival.id}`, `today.tx.${arrival.id}.amount`],
          pieces: [
            {
              key: "merchant",
              text: arrival.merchant,
              meta: "Posts later",
              color: colors.tertiary,
              fontSize: 15,
              fontWeight: "600",
              from,
              toAnchor: `today.tx.${arrival.id}`,
              toFontSize: 16,
            },
            {
              key: "amount",
              text: arrival.amount,
              color: colors.tertiary,
              fontSize: 15,
              fontWeight: "700",
              from: { x: from.x + 120, y: from.y, width: 88, height: 28 },
              toAnchor: `today.tx.${arrival.id}.amount`,
              toFontSize: 16,
            },
          ],
        },
        reduceMotion,
      );
    });
  }, [reduceMotion]);

  useEffect(() => {
    const txs = shownDash?.transactions ?? [];
    const ids = new Set(txs.map((tx) => tx.id));
    if (seenTx.current == null) {
      seenTx.current = ids;
      return;
    }
    const fresh = txs.filter((tx) => !seenTx.current?.has(tx.id));
    seenTx.current = ids;
    fresh.forEach((tx, index) => {
      const bill = bills.find((row) => sameMerchant(row.merchantName, tx.merchantName || tx.name));
      const from = bill ? anchorRect(`today.bill.${bill.id}`) : null;
      if (!bill || !from) return;
      playFlight(
        {
          id: `bill-arrive-${tx.id}`,
          hide: [`today.tx.${tx.id}`],
          pieces: [
            {
              key: tx.id,
              text: bill.merchantName,
              meta: inDaysPhrase(bill.nextDate),
              toMeta: tx.pending ? "Posts later" : dayLabel(tx.date),
              color: colors.ink,
              toColor: tx.pending ? colors.tertiary : flowMoney(tx.amountCents).color,
              fontSize: 16,
              fontWeight: "600",
              from,
              toAnchor: `today.tx.${tx.id}`,
              delay: index * 40,
            },
          ],
        },
        reduceMotion,
      );
    });
  }, [shownDash, bills, reduceMotion]);

  function openSpend(id: string, kind: "slice" | "row") {
    if (id === "rest") {
      router.push("/insights");
      return;
    }
    const anchor = kind === "slice" ? `today.slice.${id}` : `today.cat.${id}`;
    const from = anchorRect(anchor);
    const row = spendRows.find((item) => (item.id || item.name) === id);
    if (from && row) {
      setCategoryReturn(anchor, from);
      stageFlight(
        {
          id: "category-open",
          hide: ["activity.category.title", "activity.category.amount"],
          pieces: [
            { key: "swatch", kind: "fill", color: shelfColor(row.color), fontSize: 8, from, toAnchor: "activity.category.banner" },
            { key: "name", text: row.name, color: colors.ink, fontSize: 15, fontWeight: "600", from, toAnchor: "activity.category.title", toFontSize: 22 },
            { key: "amount", text: money(row.cents), color: colors.ink, fontSize: 15, fontWeight: "700", from, toAnchor: "activity.category.amount", toFontSize: 28 },
          ],
        },
        reduceMotion,
      );
    }
    router.push({ pathname: "/(app)/activity", params: { categoryId: row?.id && row.id !== "rest" ? row.id : id, start: range.start, end: range.end } });
  }

  function heroFacts(includePlan: boolean) {
    const items: { kicker: string; value: string; color?: string; onPress?: () => void; anchor?: string }[] = includePlan
      ? [
          { kicker: "Spent", value: money(spentCents) },
          { kicker: "Plan", value: money(totalPlannedCents) },
        ]
      : [
          { kicker: "Income", value: money(shownDash?.cashFlow.incomeCents ?? 0) },
          { kicker: "Spent", value: money(shownDash?.cashFlow.spendingCents ?? 0) },
          {
            kicker: savedCents < 0 ? "Net deficit" : "Net saved",
            value: money(Math.abs(savedCents)),
            color: savedCents < 0 ? colors.danger : colors.positive,
          },
        ];
    if (includePlan && afterBills != null) {
      items.push({
        kicker: "After bills",
        value: money(afterBills),
        color: afterBills < 0 ? colors.danger : undefined,
        anchor: "today.after",
        onPress: () => {
          tapPress();
          const from = anchorRect("today.after");
          const counted = recurrences ? billsCountedInMonth(recurrences, now.getFullYear(), now.getMonth() + 1) : [];
          if (from && dueCents != null) {
            stageFlight(
              {
                id: "after-bills",
                hide: ["bills.hero", ...counted.map((bill) => `bills.row.${bill.id}.amount`)],
                pieces: [
                  {
                    key: "sum",
                    text: money(dueCents),
                    color: colors.ink,
                    fontSize: 15,
                    fontWeight: "700",
                    from,
                    toAnchor: "bills.hero",
                    toFontSize: 46,
                  },
                  ...counted.map((bill, index) => ({
                    key: `${bill.id}-${index}`,
                    text: money(bill.cents),
                    color: colors.ink,
                    fontSize: 15,
                    fontWeight: "600" as const,
                    from,
                    toAnchor: `bills.row.${bill.id}.amount`,
                    toFontSize: 16,
                    delay: 30 + index * 36,
                  })),
                ],
              },
              reduceMotion,
            );
          }
          router.push("/bills");
        },
      });
    }
    if (includePlan) {
      items[0] = { ...items[0], anchor: "today.spent" };
    }
    if (pendingCents > 0) {
      items.push({ kicker: "Pending", value: money(pendingCents), color: colors.tertiary, anchor: "today.pending" });
    }
    return items;
  }

  return (
    <Screen framed onRefresh={load}>
      {error ? <LoadError message={error} onRetry={() => void load()} /> : null}
      {!shownDash && !error ? <Loading /> : null}

      {shownDash ? (
        <>
          {totalPlannedCents > 0 ? (
            <Hero
              label={scrub ? shortDate(scrub.date) : "Left to spend"}
              cents={scrub ? scrub.cents : leftCents}
              tone={!scrub && leftCents < 0 ? "bad" : undefined}
              status={{ label: pace.label, tone: pace.tone }}
              points={shownDash.spendSeries}
              reference={{ cents: paceCents, label: "Pace" }}
              onScrub={setScrub}
              live={scrub != null}
              figureAnchor={scrub ? undefined : "today.left"}
              chartHandoff
              figureSeed={figureSeed}
              onPressFigure={() => {
                tapPress();
                launchLeftToPlan(reduceMotion);
                router.push("/(app)/budget");
              }}
            >
              <Facts items={heroFacts(true)} />
            </Hero>
          ) : (
            <Hero
              label="Net worth"
              cents={worth ?? 0}
              tone={(worth ?? 0) < 0 ? "bad" : undefined}
              points={shownDash.spendSeries}
            >
              <Facts items={heroFacts(false)} />
            </Hero>
          )}

          <Card>
            <MenuRow
              title="Your money"
              subtitle={nearest ? `${nearest.name} · ${money(nearest.remainingCents)} left` : undefined}
              icon="wallet"
              compact
              onPress={() => setMoneyOpen(true)}
            />
          </Card>

          {/* Quick Review Prompt when Unreviewed Charges Exist */}
          {shownDash.unreviewed.count > 0 ? (
            <ReviewBanner
              count={shownDash.unreviewed.count}
              onPress={() => {
                router.push({ pathname: "/(app)/activity", params: { reviewed: "false", focus: "1" } });
              }}
            />
          ) : null}

          {/* First run / empty state */}
          {shownDash.accountCount === 0 && shownDash.transactions.length === 0 ? (
            <Card>
              <View style={{ gap: 14, alignItems: "center", padding: 24 }}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: colors.ink }}>
                  Welcome to Shelf
                </Text>
                <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center", lineHeight: 20 }}>
                  Add an account to see what you’ve spent and what’s left in the budget.
                </Text>
                <Button label="Add an account" onPress={() => router.push("/(app)/accounts")} block />
              </View>
            </Card>
          ) : (
            <>
              {/* Latest Transactions Ledger */}
              {latest.length > 0 ? (
                <View style={{ gap: 8 }}>
                  <Section
                    title="Latest Activity"
                    action="See all"
                    onAction={() => {
                      tapPress();
                      router.push("/(app)/activity");
                    }}
                  />
                  <Card>
                    {latest.map((tx, index) => {
                      const when = dayLabel(tx.date);
                      const whenShort = when === "Today" || when === "Yesterday" ? when : shortDate(tx.date);
                      const label = tx.merchantName || tx.name;
                      const flow = flowMoney(tx.amountCents);
                      return (
                        <LedgerRow
                          key={tx.id}
                          divided={index > 0}
                          name={label}
                          color={tx.category?.color}
                          meta={[whenShort, tx.category?.name, tx.pending ? "Posts later" : ""].filter(Boolean).join(" · ")}
                          amount={flow.text}
                          amountColor={tx.pending ? colors.tertiary : flow.color}
                          rowAnchor={`today.tx.${tx.id}`}
                          amountAnchor={`today.tx.${tx.id}.amount`}
                          onPress={() => {
                            router.push({ pathname: "/merchant", params: { name: label } });
                          }}
                        />
                      );
                    })}
                  </Card>
                </View>
              ) : null}

              {/* Upcoming Fixed Commitments (Bills & Subscriptions) */}
              {upcomingBillsSlice.length > 0 || suggestions > 0 ? (
                <View style={{ gap: 8 }}>
                  <Section
                    title="Committed Bills"
                    action="All bills"
                    onAction={() => {
                      tapPress();
                      router.push("/bills");
                    }}
                  />
                  <Card>
                    {upcomingBillsSlice.map((bill, index) => {
                      const match =
                        (shownDash?.transactions ?? []).find(
                          (tx) => tx.amountCents > 0 && sameMerchant(bill.merchantName, tx.merchantName || tx.name),
                        ) ?? null;
                      return <BillDrag key={bill.id} bill={bill} match={match} index={index} reduceMotion={reduceMotion} />;
                    })}
                    {suggestions > 0 ? (
                      <Pressable
                        onPress={() => {
                          tapPress();
                          router.push("/bills");
                        }}
                        style={({ pressed }) => [
                          {
                            minHeight: 52,
                            paddingHorizontal: 16,
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            borderTopWidth: upcomingBillsSlice.length ? StyleSheet.hairlineWidth : 0,
                            borderTopColor: colors.line,
                          },
                          pressed ? { backgroundColor: colors.fill } : null,
                        ]}
                      >
                        <Text style={{ fontSize: 15, color: colors.ink }}>
                          {suggestions === 1 ? "1 potential recurring charge" : `${suggestions} potential recurring charges`}
                        </Text>
                        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.accentInk }}>Review</Text>
                      </Pressable>
                    ) : null}
                  </Card>
                </View>
              ) : null}

              {/* Where It Went (Category Spending) */}
              {spendRows.length > 0 ? (
                <View style={{ gap: 8 }}>
                  <Section
                    title="Where It Went"
                    trailing={money(shownDash.cashFlow.spendingCents)}
                    action="Insights"
                    onAction={() => {
                      tapPress();
                      router.push("/insights");
                    }}
                  />
                  <Card>
                    <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 }}>
                      <SpendMix
                        rows={spendRows.map((row) => ({ key: row.id || row.name, cents: row.cents, color: shelfColor(row.color) }))}
                        anchorFor={(key) => `today.slice.${key}`}
                        onSlice={(key) => openSpend(key, "slice")}
                      />
                    </View>
                    {spendRows.map((row, index) => (
                      <SpendCategoryRow key={row.id || row.name} row={row} index={index} onPress={() => openSpend(row.id || row.name, "row")} />
                    ))}
                  </Card>
                </View>
              ) : null}
            </>
          )}
        </>
      ) : null}
      {moneyOpen ? (
        <Sheet title="Your money" fit onClose={() => setMoneyOpen(false)}>
          <Card>
            <MenuRow
              title="Goals"
              icon="flag"
              trailing={goalLine ? <RemainingFigure text={goalLine} /> : undefined}
              onPress={() => {
                setMoneyOpen(false);
                router.push("/goals");
              }}
            />
            <MenuRow
              title="Cash flow"
              icon="flow"
              divided
              trailing={
                shownDash ? (
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: saved.tone === "good" ? colors.positive : saved.tone === "bad" ? colors.danger : colors.ink,
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {`${saved.signed ? "-" : ""}${money(saved.cents)}`}
                  </Text>
                ) : undefined
              }
              onPress={() => {
                setMoneyOpen(false);
                router.push("/cash-flow");
              }}
            />
            <MenuRow
              title="Investments"
              icon="chart"
              divided
              trailing={marketCents == null ? undefined : <MarketValue cents={marketCents} gainCents={gainCents ?? null} />}
              onPress={() => {
                const from = anchorRect("market.today");
                const mem = recallAnchor("market.today");
                if (from && mem) {
                  stageFlight(
                    {
                      id: "market-open",
                      hide: ["market.hero"],
                      pieces: [
                        {
                          key: "market",
                          text: mem.text,
                          color: mem.color,
                          fontSize: mem.fontSize,
                          fontWeight: "700",
                          from,
                          toAnchor: "market.hero",
                          toFontSize: 46,
                        },
                      ],
                    },
                    reduceMotion,
                  );
                }
                setMoneyOpen(false);
                router.push("/investments");
              }}
            />
          </Card>
        </Sheet>
      ) : null}
    </Screen>
  );
}

function RemainingFigure({ text }: { text: string }) {
  const measure = useMeasuredAnchor("money.remaining", { text, color: colors.ink, fontSize: 14 });
  const opacity = useFlightHidden("money.remaining");
  return (
    <View ref={measure.ref} onLayout={measure.onLayout} collapsable={false} style={{ opacity, flexShrink: 1 }}>
      <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", color: colors.ink, fontVariant: ["tabular-nums"] }}>{text}</Text>
    </View>
  );
}

function MarketValue({ cents, gainCents }: { cents: number; gainCents: number | null }) {
  const text = money(cents);
  const measure = useMeasuredAnchor("market.today", { text, color: colors.ink, fontSize: 14 });
  return (
    <View ref={measure.ref} onLayout={measure.onLayout} collapsable={false}>
      <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", fontVariant: ["tabular-nums"] }}>
        <Text style={{ color: colors.ink }}>{text}</Text>
        {gainCents != null ? (
          <Text style={{ color: gainCents >= 0 ? colors.positive : colors.danger }}>{`  ${money(Math.abs(gainCents))}`}</Text>
        ) : null}
      </Text>
    </View>
  );
}

function SpendCategoryRow({
  row,
  index,
  onPress,
}: {
  row: { id: string; name: string; cents: number; color: string };
  index: number;
  onPress: () => void;
}) {
  const measure = useMeasuredAnchor(`today.cat.${row.id || row.name}`, { text: row.name, color: colors.ink, fontSize: 15 });
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: 50,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.line,
        },
        pressed ? { backgroundColor: colors.fill } : null,
      ]}
    >
      <View ref={measure.ref} onLayout={measure.onLayout} collapsable={false} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: shelfColor(row.color) }} />
        <Text style={{ flex: 1, fontSize: 15, color: colors.ink }} numberOfLines={1}>
          {row.name}
        </Text>
      </View>
      <Text style={{ fontSize: 15, fontWeight: "600", color: colors.ink, fontVariant: ["tabular-nums"] }}>{money(row.cents)}</Text>
    </Pressable>
  );
}

function BillDrag({
  bill,
  match,
  index,
  reduceMotion,
}: {
  bill: { id: string; merchantName: string; amountCents: number; nextDate: string };
  match: { id: string; pending: boolean; amountCents: number } | null;
  index: number;
  reduceMotion: boolean;
}) {
  const shift = useRef(new Animated.Value(0)).current;
  const rowRef = useRef<View>(null);
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => gesture.dy < -8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_, gesture) => {
          shift.setValue(Math.min(0, gesture.dy));
        },
        onPanResponderRelease: (_, gesture) => {
          const destination = match ? anchorRect(`today.tx.${match.id}`) : null;
          if (gesture.dy < -48 && match && destination) {
            rowRef.current?.measureInWindow((x, y, width, height) => {
              if (width <= 0) return;
              playFlight(
                {
                  id: `bill-${bill.id}`,
                  hide: [`today.tx.${match.id}`],
                  pieces: [
                    {
                      key: bill.id,
                      text: bill.merchantName,
                      meta: inDaysPhrase(bill.nextDate),
                      toMeta: match.pending ? "Posts later" : dayLabel(new Date().toISOString().slice(0, 10)),
                      color: colors.ink,
                      toColor: match.pending ? colors.tertiary : flowMoney(match.amountCents).color,
                      fontSize: 16,
                      fontWeight: "600",
                      from: { x, y, width, height },
                      to: destination,
                    },
                  ],
                },
                reduceMotion,
              );
            });
          }
          Animated.spring(shift, { toValue: 0, useNativeDriver: true, stiffness: 420, damping: 28 }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(shift, { toValue: 0, useNativeDriver: true, stiffness: 420, damping: 28 }).start();
        },
      }),
    [bill, match, reduceMotion, shift],
  );
  return (
    <Animated.View ref={rowRef} {...pan.panHandlers} style={{ transform: [{ translateY: shift }] }}>
      <LedgerRow
        divided={index > 0}
        name={bill.merchantName}
        meta={inDaysPhrase(bill.nextDate)}
        amount={money(bill.amountCents)}
        rowAnchor={`today.bill.${bill.id}`}
        amountAnchor={`today.bill.${bill.id}.amount`}
        onPress={() => router.push("/bills")}
      />
    </Animated.View>
  );
}
