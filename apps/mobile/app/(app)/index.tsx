import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api, load as read, peek } from "../../src/api";
import { categorizeLabel, dayLabel, daysLeftInMonth, flowMoney, inDaysPhrase, money, monthRange, shelfColor, shortDate, todayISO } from "../../src/format";
import { Button, Card, colors, Facts, Hero, LedgerRow, Loading, Note, Progress, ReviewBanner, Screen, Section, SpendMix } from "../../src/ui";

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
    category: { name: string; color: string } | null;
  }[];
  spending?: { id: string; name: string; cents: number; color: string }[];
  suggestedSubscriptions?: { merchantName: string }[];
};

export default function HomeScreen() {
  const [data, setData] = useState<Dash | null>(() => peek<Dash>("/api/dashboard") ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scrub, setScrub] = useState<{ date: string; cents: number } | null>(null);

  const load = useCallback(() => {
    return read<Dash>("/api/dashboard")
      .then((next) => {
        setData(next);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load home"));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function sample() {
    setBusy(true);
    try {
      await api("/api/demo/seed", { method: "POST" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load sample data");
    } finally {
      setBusy(false);
    }
  }

  const today = todayISO();
  const now = new Date();
  const range = monthRange(now.getFullYear(), now.getMonth() + 1);
  const bills = (data?.recurring ?? []).filter((row) => !row.isIncome && row.nextDate >= today).slice(0, 4);
  const categories = (data?.spending ?? []).filter((row) => row.cents > 0);
  const restCents = categories.slice(5).reduce((sum, row) => sum + row.cents, 0);
  const spendRows =
    restCents > 0
      ? [...categories.slice(0, 5), { id: "rest", name: "Everything else", cents: restCents, color: "#8B939E" }]
      : categories;
  const latest = data?.transactions.slice(0, 4) ?? [];
  const suggestions = data?.suggestedSubscriptions?.length ?? 0;
  const left = data?.budget.remainingCents ?? 0;
  const overPlan = Boolean(data && data.budget.plannedCents > 0 && left < 0);
  const daysLeft = daysLeftInMonth();
  const dayWord = daysLeft === 1 ? "day" : "days";
  const showCash = Boolean(data && (data.cashFlow.incomeCents !== 0 || data.cashFlow.spendingCents !== 0));
  const shown = scrub?.cents ?? data?.cashFlow.spendingCents ?? 0;

  return (
    <Screen framed onRefresh={load}>
      {error ? <Note>{error}</Note> : null}
      {!data && !error ? <Loading /> : null}
      {data ? (
        <>
          <Hero
            label={scrub ? dayLabel(scrub.date) : "Spent this month"}
            cents={shown}
            points={data.spendSeries}
            onScrub={setScrub}
            live={scrub != null}
          >
            {scrub || !showCash ? null : (
              <Facts
                items={[
                  { kicker: "Income", value: money(data.cashFlow.incomeCents) },
                  {
                    kicker: data.cashFlow.savedCents < 0 ? "Over income" : "Saved",
                    value: money(Math.abs(data.cashFlow.savedCents)),
                    color: data.cashFlow.savedCents < 0 ? colors.danger : colors.positive,
                  },
                ]}
              />
            )}
          </Hero>

          {data.budget.plannedCents > 0 ? (
            <Pressable
              onPress={() => router.push("/(app)/budget")}
              style={({ pressed }) => [
                {
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderRadius: 20,
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.line,
                  gap: 10,
                },
                pressed ? { backgroundColor: colors.fill } : null,
              ]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", letterSpacing: -0.3, color: colors.ink }}>{overPlan ? "Over the plan" : "Left to spend"}</Text>
                  <Text style={{ fontSize: 13, color: colors.muted }}>
                    {overPlan ? `${daysLeft} ${dayWord} left in the month` : `${money(Math.round(left / daysLeft))} a day · ${daysLeft} ${dayWord} left`}
                  </Text>
                </View>
                <Text style={{ fontSize: 22, fontWeight: "600", letterSpacing: -0.6, color: overPlan ? colors.danger : colors.positive }}>{money(Math.abs(left))}</Text>
              </View>
              <Progress value={data.budget.spentCents} max={data.budget.plannedCents} />
            </Pressable>
          ) : null}

          {data.accountCount === 0 && data.transactions.length === 0 ? (
            <View style={{ gap: 12, alignItems: "center" }}>
              <Text style={{ fontSize: 17, fontWeight: "600", color: colors.ink }}>Start with one account</Text>
              <Button label="Add an account" onPress={() => router.push("/(app)/accounts")} />
              <Button label={busy ? "Loading…" : "Load sample data"} tone="quiet" onPress={() => void sample()} busy={busy} />
            </View>
          ) : (
            <>
              {data.unreviewed.count > 0 ? (
                <ReviewBanner label={categorizeLabel(data.unreviewed.count)} onPress={() => router.push({ pathname: "/(app)/activity", params: { reviewed: "false", focus: "1" } })} />
              ) : null}

              {latest.length > 0 ? (
                <View style={{ gap: 8 }}>
                  <Section title="Latest" action="Activity" onAction={() => router.push("/(app)/activity")} />
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
                          onPress={() => router.push({ pathname: "/(app)/activity", params: { q: label } })}
                        />
                      );
                    })}
                  </Card>
                </View>
              ) : null}

              {bills.length > 0 || suggestions > 0 ? (
                <View style={{ gap: 8 }}>
                  <Section title="Coming up" action="Bills" onAction={() => router.push("/bills")} />
                  <Card>
                    {bills.map((bill, index) => (
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
                      <Pressable onPress={() => router.push("/bills")} style={{ minHeight: 56, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: bills.length ? 1 : 0, borderTopColor: colors.line }}>
                        <Text style={{ fontSize: 16, color: colors.ink }}>{suggestions === 1 ? "1 charge looks like a bill" : `${suggestions} charges look like bills`}</Text>
                        <Text style={{ fontSize: 15, fontWeight: "600", color: colors.accentInk }}>Check</Text>
                      </Pressable>
                    ) : null}
                  </Card>
                </View>
              ) : null}

              {spendRows.length > 0 ? (
                <View style={{ gap: 8 }}>
                  <Section title="Where it went" trailing={money(data.cashFlow.spendingCents)} action="Compare" onAction={() => router.push("/insights")} />
                  <Card>
                    <SpendMix rows={spendRows.map((row) => ({ key: row.id || row.name, cents: row.cents, color: shelfColor(row.color) }))} />
                    {spendRows.map((row, index) => (
                      <Pressable
                        key={row.id || row.name}
                        onPress={() =>
                          router.push(
                            row.id === "rest"
                              ? "/insights"
                              : { pathname: "/(app)/activity", params: { categoryId: row.id, start: range.start, end: range.end } },
                          )
                        }
                        style={{ minHeight: 52, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.line }}
                      >
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: shelfColor(row.color) }} />
                        <Text style={{ flex: 1, fontSize: 16, color: colors.ink }} numberOfLines={1}>
                          {row.name}
                        </Text>
                        <Text style={{ fontSize: 15, fontWeight: "600", color: colors.ink }}>{money(row.cents)}</Text>
                      </Pressable>
                    ))}
                  </Card>
                </View>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </Screen>
  );
}
