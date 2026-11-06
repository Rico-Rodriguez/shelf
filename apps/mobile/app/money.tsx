import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { load as read, peek } from "../src/api";
import { signed, dashboardPath, money, monthSaved, nearestOpenGoal } from "../src/format";
import { anchorRect, goalPreview, recallAnchor, stageFlight, useFlightHidden, useMeasuredAnchor } from "../src/flight";
import { useReduceMotion } from "../src/theme";
import { Back, Card, colors, MenuRow, Screen } from "../src/ui";

type OpenGoal = {
  id: string;
  name: string;
  remainingCents: number;
  targetDate: string | null;
};

type Invest = { totalCents?: number; gainCents?: number | null };
type Cash = { incomeCents: number; spendingCents: number };

export default function MoneyScreen() {
  const reduceMotion = useReduceMotion();
  const [goals, setGoals] = useState<OpenGoal[] | null>(() => peek<{ goals: OpenGoal[] }>("/api/goals")?.goals ?? null);
  const [investments, setInvestments] = useState<Invest | null>(() => peek<Invest>("/api/investments") ?? null);
  const [cash, setCash] = useState<Cash | null>(() => peek<{ cashFlow: Cash }>(dashboardPath())?.cashFlow ?? null);
  const goalAdjust = goalPreview();

  const load = useCallback(() => {
    return Promise.all([
      read<{ goals: OpenGoal[] }>("/api/goals").catch(() => null),
      read<Invest>("/api/investments").catch(() => null),
      read<{ cashFlow: Cash }>(dashboardPath()).catch(() => null),
    ]).then(([goalRows, invest, dash]) => {
      if (goalRows) setGoals(goalRows.goals);
      if (invest) setInvestments(invest);
      if (dash) setCash(dash.cashFlow);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const nearest = goals
    ? nearestOpenGoal(
        goals.map((goal) => {
          if (goalAdjust?.id !== goal.id) return goal;
          const preview = Math.max(0, goalAdjust.remainingCents - goalAdjust.addedCents);
          return { ...goal, remainingCents: Math.min(goal.remainingCents, preview) };
        }),
      )
    : null;
  const goalLine = goals == null ? null : goals.length === 0 ? "No goals" : `${money((nearest ?? goals[0]).remainingCents)} left`;
  const saved = cash ? monthSaved(cash.incomeCents, cash.spendingCents) : null;
  const marketCents = investments?.totalCents;
  const gainCents = investments?.gainCents ?? null;

  return (
    <Screen title="Your money" refresh={<Back label="Today" />} onRefresh={load}>
      <Card>
        <MenuRow
          title="Goals"
          icon="flag"
          trailing={goalLine ? <RemainingFigure text={goalLine} /> : undefined}
          onPress={() => router.push("/goals")}
        />
        <MenuRow
          title="Cash flow"
          icon="flow"
          divided
          trailing={
            saved ? (
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
          onPress={() => router.push("/cash-flow")}
        />
        <MenuRow
          title="Investments"
          icon="chart"
          divided
          trailing={marketCents == null ? undefined : <MarketValue cents={marketCents} gainCents={gainCents} />}
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
            router.push("/investments");
          }}
        />
      </Card>
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
          <Text style={{ color: gainCents >= 0 ? colors.positive : colors.danger }}>{`  ${signed(gainCents)}`}</Text>
        ) : null}
      </Text>
    </View>
  );
}
