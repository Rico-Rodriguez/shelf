import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { load as read, peek, subscribeCache } from "../../src/api";
import { dashboardPath, dayLabel, flowMoney, money, shortDate } from "../../src/format";
import { useFlightArrival, useFlightClock, useFlightHidden, useMeasuredAnchor, playFlight } from "../../src/flight";
import { tapPress, tapSelect } from "../../src/haptic";
import { Icon } from "../../src/icons";
import { islandSitPlan, markIslandSat, onIslandSit } from "../../src/island";
import { mergeDashboard, subscribeLive } from "../../src/live-edits";
import { buildPeriod, MONTHS_OF_HISTORY, RANGES, valueAt, type Monthly, type Range } from "../../src/periods";
import { useReduceMotion, useTheme } from "../../src/theme";
import { TrendChart, type TrendPoint } from "../../src/trend";
import { Button, colors, LedgerRow, LoadError, Loading, RollingFigure, Screen, Section } from "../../src/ui";

type Dash = {
  cashFlow: { incomeCents: number; spendingCents: number; savedCents: number };
  pendingCents?: number;
  budget: { plannedCents: number; spentCents: number; remainingCents: number };
  unreviewed: { count: number };
  accountCount: number;
  spendSeries?: { date: string; cents: number }[];
  transactions: {
    id: string;
    name: string;
    merchantName: string | null;
    amountCents: number;
    date: string;
    pending: boolean;
    reviewed?: boolean;
    categoryId?: string | null;
    category: { id?: string; name: string; color: string } | null;
  }[];
};

type CashFlow = { series: { key: string; spending: number }[] };

function lastMonthPath() {
  const now = new Date();
  return dashboardPath(new Date(now.getFullYear(), now.getMonth() - 1, 1));
}

const CASH_FLOW = `/api/cash-flow?months=${MONTHS_OF_HISTORY}`;

export default function HomeScreen() {
  const dashPath = dashboardPath();
  const prevPath = lastMonthPath();
  const { palette } = useTheme();
  const reduceMotion = useReduceMotion();
  const [data, setData] = useState<Dash | null>(() => peek<Dash>(dashPath) ?? null);
  const [lastMonth, setLastMonth] = useState<Dash | null>(() => peek<Dash>(prevPath) ?? null);
  const [monthly, setMonthly] = useState<Monthly | null>(() => toMonthly(peek<CashFlow>(CASH_FLOW)));
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("1M");
  const [scrub, setScrub] = useState<TrendPoint | null>(null);
  useFlightClock();

  const load = useCallback(() => {
    void read<Dash>(prevPath)
      .then(setLastMonth)
      .catch(() => undefined);
    void read<CashFlow>(CASH_FLOW)
      .then((res) => setMonthly(toMonthly(res)))
      .catch(() => undefined);
    return read<Dash>(dashPath)
      .then((next) => {
        setData(next);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load home"));
  }, [dashPath, prevPath]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const [liveTick, setLiveTick] = useState(0);
  useEffect(() => subscribeLive(() => setLiveTick((value) => value + 1)), []);
  useEffect(() => subscribeCache<Dash>(dashPath, (next) => next && setData(next)), [dashPath]);
  const shown = useMemo(() => (data ? mergeDashboard(data) : null), [data, liveTick]);

  useFlightArrival("island-sit", reduceMotion);
  useEffect(() => {
    return onIslandSit((arrival) => {
      markIslandSat(arrival.id);
      playFlight(islandSitPlan(arrival, colors.tertiary), reduceMotion);
    });
  }, [reduceMotion]);

  const period = useMemo(
    () =>
      shown
        ? buildPeriod(range, {
            thisMonth: shown.spendSeries ?? [],
            lastMonth: lastMonth?.spendSeries ?? null,
            monthly,
            thisMonthTotal: shown.cashFlow.spendingCents,
          })
        : null,
    [shown, lastMonth, monthly, range],
  );

  const figure = money(scrub ? scrub.cents : (period?.totalCents ?? 0));
  const figureMeasure = useMeasuredAnchor(scrub ? undefined : "today.left", { text: figure, color: colors.ink, fontSize: 46 });
  const figureHidden = useFlightHidden("today.left");

  // While a finger is on the chart, compare that day with the same point last period.
  const delta = scrub
    ? period?.compare.length
      ? Math.round(scrub.cents - valueAt(period.compare, scrub.at))
      : null
    : (period?.deltaCents ?? null);
  const under = delta != null && delta <= 0;
  const deltaColor = delta == null ? palette.muted : under ? palette.positive : palette.warn;
  const overall = period?.deltaCents ?? null;
  const lineColor = overall != null && overall > 0 ? palette.warn : palette.positive;

  const recent = (shown?.transactions ?? []).slice(0, 5);
  const toReview = shown?.unreviewed.count ?? 0;
  const empty = shown && shown.accountCount === 0 && shown.transactions.length === 0;

  return (
    <Screen framed onRefresh={load}>
      {error ? <LoadError message={error} onRetry={() => void load()} /> : null}
      {!shown && !error ? <Loading /> : null}

      {shown && period ? (
        <>
          <View style={{ gap: 6, marginTop: -4 }}>
            <Text style={{ fontSize: 15, fontWeight: "500", color: palette.muted, letterSpacing: -0.2 }}>
              {scrub ? (scrub.label === "Today" ? "Spent so far" : `Spent by ${scrub.label}`) : period.title}
            </Text>
            <View ref={figureMeasure.ref} onLayout={figureMeasure.onLayout} collapsable={false} style={{ alignSelf: "flex-start", opacity: figureHidden }}>
              <RollingFigure
                text={figure}
                live={scrub != null}
                style={{ fontSize: 46, fontWeight: "700", letterSpacing: -1.9, color: palette.ink, fontVariant: ["tabular-nums"] }}
              />
            </View>
            <Text style={{ fontSize: 14, fontWeight: "600", color: deltaColor, letterSpacing: -0.2, fontVariant: ["tabular-nums"], minHeight: 19 }}>
              {delta == null
                  ? "Nothing to compare with yet"
                  : delta === 0
                    ? `Same as ${period.versus}`
                    : `${under ? "↓" : "↑"} ${money(Math.abs(delta))} ${under ? "less" : "more"} than ${period.versus}`}
            </Text>
          </View>

          <View style={{ gap: 14, marginTop: -6 }}>
            <TrendChart points={period.points} compare={period.compare} color={lineColor} onScrub={setScrub} />
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              {RANGES.map((item) => {
                const on = item === range;
                return (
                  <Pressable
                    key={item}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={{ "1W": "One week", "1M": "This month", "3M": "Three months", "1Y": "One year" }[item]}
                    hitSlop={6}
                    onPress={() => {
                      if (on) return;
                      tapSelect();
                      setRange(item);
                    }}
                    style={{
                      minWidth: 56,
                      height: 32,
                      borderRadius: 10,
                      borderCurve: "continuous",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: on ? `${lineColor}1f` : "transparent",
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "700", color: on ? lineColor : palette.muted, letterSpacing: -0.1 }}>{item}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {toReview > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                tapPress();
                router.push({ pathname: "/(app)/activity", params: { reviewed: "false", focus: "1" } });
              }}
              style={({ pressed }) => ({
                minHeight: 54,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingHorizontal: 14,
                borderRadius: 16,
                borderCurve: "continuous",
                backgroundColor: palette.card,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <View style={{ minWidth: 26, height: 26, paddingHorizontal: 6, borderRadius: 13, backgroundColor: palette.warn, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 13, fontWeight: "800", color: "#fff", fontVariant: ["tabular-nums"] }}>{toReview > 99 ? "99+" : toReview}</Text>
              </View>
              <Text style={{ flex: 1, fontSize: 16, fontWeight: "600", color: palette.ink, letterSpacing: -0.3 }}>
                {toReview === 1 ? "1 purchase to review" : `${toReview} purchases to review`}
              </Text>
              <Icon name="chevron" size={16} color={palette.tertiary} />
            </Pressable>
          ) : null}

          {empty ? (
            <View style={{ gap: 12, alignItems: "flex-start", paddingTop: 8 }}>
              <Text style={{ fontSize: 22, fontWeight: "700", letterSpacing: -0.5, color: palette.ink }}>Welcome to Shelf</Text>
              <Text style={{ fontSize: 15, color: palette.muted, lineHeight: 21 }}>
                Add an account, or tap + to log a purchase. Everything you spend shows up here.
              </Text>
              <Button label="Add an account" onPress={() => router.push("/accounts")} />
            </View>
          ) : recent.length ? (
            <View style={{ gap: 4 }}>
              <Section
                title="Recent"
                action="See all"
                onAction={() => {
                  tapPress();
                  router.push("/(app)/activity");
                }}
              />
              <View>
                {recent.map((tx, index) => {
                  const when = dayLabel(tx.date);
                  const label = tx.merchantName || tx.name;
                  const flow = flowMoney(tx.amountCents);
                  return (
                    <LedgerRow
                      key={tx.id}
                      bare
                      divided={index > 0}
                      name={label}
                      flag={tx.reviewed === false}
                      meta={[when === "Today" || when === "Yesterday" ? when : shortDate(tx.date), tx.category?.name, tx.pending ? "Pending" : ""].filter(Boolean).join(" · ")}
                      amount={flow.text}
                      amountColor={tx.pending ? colors.tertiary : flow.color}
                      rowAnchor={`today.tx.${tx.id}`}
                      amountAnchor={`today.tx.${tx.id}.amount`}
                      onPress={() => router.push({ pathname: "/merchant", params: { name: label } })}
                    />
                  );
                })}
              </View>
            </View>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function toMonthly(res: CashFlow | null | undefined): Monthly | null {
  if (!res?.series) return null;
  const out: Monthly = {};
  for (const row of res.series) out[row.key] = row.spending;
  return out;
}
