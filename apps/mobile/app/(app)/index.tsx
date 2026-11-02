import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { load as read, peek, subscribeCache } from "../../src/api";
import {
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
  shelfColor,
  shortDate,
  todayISO,
  type NetWorthAccount,
} from "../../src/format";
import { tapPress } from "../../src/haptic";
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
  const nearest = goals ? nearestOpenGoal(goals) : null;
  const saved = monthSaved(shownDash?.cashFlow.incomeCents ?? 0, shownDash?.cashFlow.spendingCents ?? 0);
  const savedCents = (shownDash?.cashFlow.incomeCents ?? 0) - (shownDash?.cashFlow.spendingCents ?? 0);
  const goalLine =
    goals == null ? null : goals.length === 0 ? "No goals" : `${money((nearest ?? goals[0]).remainingCents)} left`;
  const gainCents = investments?.gainCents ?? null;
  const marketCents = investments?.totalCents;

  function heroFacts(includePlan: boolean) {
    const items: { kicker: string; value: string; color?: string; onPress?: () => void }[] = includePlan
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
        onPress: () => {
          tapPress();
          router.push("/bills");
        },
      });
    }
    if (pendingCents > 0) {
      items.push({ kicker: "Pending", value: money(pendingCents), color: colors.tertiary });
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
              onPressFigure={() => {
                tapPress();
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
                    {upcomingBillsSlice.map((bill, index) => (
                      <LedgerRow
                        key={bill.id}
                        divided={index > 0}
                        name={bill.merchantName}
                        meta={inDaysPhrase(bill.nextDate)}
                        amount={money(bill.amountCents)}
                        onPress={() => router.push("/bills")}
                      />
                    ))}
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
                      <SpendMix rows={spendRows.map((row) => ({ key: row.id || row.name, cents: row.cents, color: shelfColor(row.color) }))} />
                    </View>
                    {spendRows.map((row, index) => (
                      <Pressable
                        key={row.id || row.name}
                        onPress={() => {
                          tapPress();
                          router.push(
                            row.id === "rest"
                              ? "/insights"
                              : { pathname: "/(app)/activity", params: { categoryId: row.id, start: range.start, end: range.end } },
                          );
                        }}
                        style={({ pressed }) => [
                          {
                            minHeight: 50,
                            paddingHorizontal: 16,
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 10,
                            borderTopWidth: index === 0 ? StyleSheet.hairlineWidth : StyleSheet.hairlineWidth,
                            borderTopColor: colors.line,
                          },
                          pressed ? { backgroundColor: colors.fill } : null,
                        ]}
                      >
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: shelfColor(row.color) }} />
                        <Text style={{ flex: 1, fontSize: 15, color: colors.ink }} numberOfLines={1}>
                          {row.name}
                        </Text>
                        <Text style={{ fontSize: 15, fontWeight: "600", color: colors.ink, fontVariant: ["tabular-nums"] }}>
                          {money(row.cents)}
                        </Text>
                      </Pressable>
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
              trailing={
                goalLine ? (
                  <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", color: colors.ink, fontVariant: ["tabular-nums"] }}>
                    {goalLine}
                  </Text>
                ) : undefined
              }
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
              trailing={
                marketCents == null ? undefined : (
                  <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", fontVariant: ["tabular-nums"] }}>
                    <Text style={{ color: colors.ink }}>{money(marketCents)}</Text>
                    {gainCents != null ? (
                      <Text style={{ color: gainCents >= 0 ? colors.positive : colors.danger }}>{`  ${money(Math.abs(gainCents))}`}</Text>
                    ) : null}
                  </Text>
                )
              }
              onPress={() => {
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
