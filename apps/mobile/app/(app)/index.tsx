import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { load as read, peek } from "../../src/api";
import {
  dashboardPath,
  dayLabel,
  flowMoney,
  inDaysPhrase,
  money,
  monthRange,
  netWorthCents,
  shelfColor,
  shortDate,
  todayISO,
  type NetWorthAccount,
} from "../../src/format";
import { tapPress } from "../../src/haptic";
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

type Dash = {
  cashFlow: { incomeCents: number; spendingCents: number; savedCents: number };
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

  const load = useCallback(() => {
    return Promise.all([
      read<Dash>(dashPath),
      read<{ accounts: NetWorthAccount[] }>("/api/accounts").catch(() => null),
    ])
      .then(([next, accounts]) => {
        setData(next);
        if (accounts) setWorth(netWorthCents(accounts.accounts));
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load home"));
  }, [dashPath]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const today = todayISO();
  const now = new Date();
  const range = monthRange(now.getFullYear(), now.getMonth() + 1);

  const bills = (data?.recurring ?? []).filter((row) => !row.isIncome && row.nextDate >= today);
  const upcomingBillsSlice = bills.slice(0, 3);

  const categories = (data?.spending ?? []).filter((row) => row.cents > 0);
  const restCents = categories.slice(4).reduce((sum, row) => sum + row.cents, 0);
  const spendRows =
    restCents > 0
      ? [...categories.slice(0, 4), { id: "rest", name: "Other categories", cents: restCents, color: "#8B939E" }]
      : categories.slice(0, 5);

  const latest = data?.transactions.slice(0, 4) ?? [];
  const suggestions = data?.suggestedSubscriptions?.length ?? 0;

  const totalPlannedCents = data?.budget.plannedCents ?? 0;
  const spentCents = data?.budget.spentCents ?? 0;

  return (
    <Screen framed onRefresh={load}>
      {error ? <LoadError message={error} onRetry={() => void load()} /> : null}
      {!data && !error ? <Loading /> : null}

      {data ? (
        <>
          {totalPlannedCents > 0 ? (
            <Hero
              label="Left to spend"
              cents={totalPlannedCents - spentCents}
              tone={totalPlannedCents - spentCents < 0 ? "bad" : undefined}
              points={data.spendSeries}
              onPressFigure={() => {
                tapPress();
                router.push("/(app)/budget");
              }}
            >
              <Facts
                items={[
                  { kicker: "Spent", value: money(spentCents) },
                  { kicker: "Plan", value: money(totalPlannedCents) },
                ]}
              />
            </Hero>
          ) : (
            <Hero
              label="Net worth"
              cents={worth ?? 0}
              tone={(worth ?? 0) < 0 ? "bad" : undefined}
              points={data.spendSeries}
            >
              <Facts
                items={[
                  { kicker: "Income", value: money(data.cashFlow.incomeCents) },
                  { kicker: "Spent", value: money(data.cashFlow.spendingCents) },
                  {
                    kicker: data.cashFlow.savedCents < 0 ? "Net deficit" : "Net saved",
                    value: money(Math.abs(data.cashFlow.savedCents)),
                    color: data.cashFlow.savedCents < 0 ? colors.danger : colors.positive,
                  },
                ]}
              />
            </Hero>
          )}

          <Card>
            <MenuRow
              title="Your money"
              icon="wallet"
              onPress={() => {
                tapPress();
                setMoneyOpen(true);
              }}
            />
          </Card>

          {/* Quick Review Prompt when Unreviewed Charges Exist */}
          {data.unreviewed.count > 0 ? (
            <ReviewBanner
              count={data.unreviewed.count}
              onPress={() => {
                tapPress();
                router.push({ pathname: "/(app)/activity", params: { reviewed: "false", focus: "1" } });
              }}
            />
          ) : null}

          {/* First run / empty state */}
          {data.accountCount === 0 && data.transactions.length === 0 ? (
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
                          meta={[whenShort, tx.category?.name, tx.pending ? "Pending" : ""].filter(Boolean).join(" · ")}
                          amount={flow.text}
                          amountColor={flow.color}
                          onPress={() => {
                            tapPress();
                            router.push({ pathname: "/(app)/activity", params: { q: label } });
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
                        onPress={() => {
                          tapPress();
                          router.push("/bills");
                        }}
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
                    trailing={money(data.cashFlow.spendingCents)}
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
        <Sheet title="Your money" onClose={() => setMoneyOpen(false)}>
          <MenuRow
            title="Goals"
            icon="flag"
            onPress={() => {
              setMoneyOpen(false);
              router.push("/goals");
            }}
          />
          <MenuRow
            title="Cash flow"
            icon="flow"
            onPress={() => {
              setMoneyOpen(false);
              router.push("/cash-flow");
            }}
          />
          <MenuRow
            title="Investments"
            icon="chart"
            onPress={() => {
              setMoneyOpen(false);
              router.push("/investments");
            }}
          />
        </Sheet>
      ) : null}
    </Screen>
  );
}
