import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api } from "../../src/api";
import { categorizeLabel, dayLabel, inDaysPhrase, money, outflow, shortDate, todayISO } from "../../src/format";
import { Icon } from "../../src/icons";
import { Button, Card, colors, LedgerRow, Loading, Note, Screen, Section } from "../../src/ui";

type Dash = {
  cashFlow: { incomeCents: number; spendingCents: number; savedCents: number };
  budget: { plannedCents: number; spentCents: number; remainingCents: number };
  unreviewed: { count: number };
  accountCount: number;
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
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    void api<Dash>("/api/dashboard")
      .then((next) => {
        setData(next);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load home"));
  }, []);

  useFocusEffect(load);

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

  return (
    <Screen title="Shelf" subtitle="This month">
      {error ? <Note>{error}</Note> : null}
      {!data ? <Loading /> : null}
      {data ? (
        <>
          <Card>
            <Text style={{ fontSize: 13, color: colors.muted }}>Spent this month</Text>
            <Text style={{ fontSize: 40, fontWeight: "600", letterSpacing: -1, color: colors.ink }}>{money(data.cashFlow.spendingCents)}</Text>
            <View style={{ flexDirection: "row", gap: 16, marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: colors.muted }}>Income</Text>
                <Text style={{ fontSize: 16, fontWeight: "600" }}>{money(data.cashFlow.incomeCents)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: colors.muted }}>{data.cashFlow.savedCents < 0 ? "Over income" : "Saved"}</Text>
                <Text style={{ fontSize: 16, fontWeight: "600", color: data.cashFlow.savedCents < 0 ? colors.danger : colors.positive }}>
                  {money(Math.abs(data.cashFlow.savedCents))}
                </Text>
              </View>
            </View>
          </Card>

          {data.budget.plannedCents > 0 ? (
            <Pressable onPress={() => router.push("/(app)/budget")}>
              <Card>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontSize: 16 }}>{overPlan ? "Over this month" : "Left this month"}</Text>
                  <Text style={{ fontSize: 18, fontWeight: "600", color: overPlan ? colors.danger : colors.positive }}>{money(Math.abs(left))}</Text>
                </View>
              </Card>
            </Pressable>
          ) : null}

          {data.accountCount === 0 && data.transactions.length === 0 ? (
            <Button label={busy ? "Loading sample…" : "Load sample data"} onPress={() => void sample()} busy={busy} />
          ) : (
            <>
              {data.unreviewed.count > 0 ? (
                <Pressable onPress={() => router.push("/(app)/activity")}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 16, padding: 16 }}>
                    <Text style={{ flex: 1, fontSize: 16 }}>{categorizeLabel(data.unreviewed.count)}</Text>
                    <Icon name="chevron" size={18} color={colors.muted} />
                  </View>
                </Pressable>
              ) : null}

              {latest.length > 0 ? (
                <>
                  <Section title="Latest" action="Activity" onAction={() => router.push("/(app)/activity")} />
                  <Card>
                    {latest.map((tx) => {
                      const when = dayLabel(tx.date);
                      const whenShort = when === "Today" || when === "Yesterday" ? when : shortDate(tx.date);
                      const label = tx.merchantName || tx.name;
                      return (
                        <LedgerRow
                          key={tx.id}
                          name={label}
                          color={tx.category?.color}
                          meta={[whenShort, tx.category?.name, tx.pending ? "Pending" : ""].filter(Boolean).join(" · ")}
                          amount={outflow(tx.amountCents)}
                          onPress={() => router.push("/(app)/activity")}
                        />
                      );
                    })}
                  </Card>
                </>
              ) : null}

              {bills.length > 0 || suggestions > 0 ? (
                <>
                  <Section title="Coming up" action="Bills" onAction={() => router.push("/bills")} />
                  <Card>
                    {bills.map((bill) => (
                      <LedgerRow
                        key={bill.id}
                        name={bill.merchantName}
                        meta={inDaysPhrase(bill.nextDate)}
                        amount={money(bill.amountCents)}
                        onPress={() => router.push("/bills")}
                      />
                    ))}
                    {suggestions > 0 ? (
                      <Pressable onPress={() => router.push("/bills")} style={{ paddingVertical: 10 }}>
                        <Text>{suggestions === 1 ? "1 charge looks like a bill" : `${suggestions} charges look like bills`}</Text>
                      </Pressable>
                    ) : null}
                  </Card>
                </>
              ) : null}

              {spendRows.length > 0 ? (
                <>
                  <Section title="Where it went" action="Compare" onAction={() => router.push("/insights")} />
                  <Card>
                    {spendRows.map((row) => (
                      <Pressable key={row.id || row.name} onPress={() => router.push("/insights")} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: row.color || colors.muted }} />
                        <Text style={{ flex: 1, fontSize: 16 }} numberOfLines={1}>{row.name}</Text>
                        <Text style={{ fontSize: 15, fontWeight: "600" }}>{money(row.cents)}</Text>
                      </Pressable>
                    ))}
                  </Card>
                </>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </Screen>
  );
}
