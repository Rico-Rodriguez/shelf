import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api, load as read, peek } from "../../src/api";
import { ChargeSheet, ChargeGroup } from "../../src/charge";
import {
  categorizeLabel,
  dayLabel,
  daysLeftInMonth,
  flowMoney,
  inDaysPhrase,
  money,
  monthRange,
  shelfColor,
  shortDate,
  todayISO,
} from "../../src/format";
import { tapPress, tapSelect } from "../../src/haptic";
import { Icon } from "../../src/icons";
import { SwipeRow } from "../../src/swipe";
import { celebrate } from "../../src/toast";
import {
  Button,
  Card,
  colors,
  Facts,
  Field,
  Hero,
  LedgerRow,
  Loading,
  Note,
  ReviewBanner,
  Screen,
  Section,
  Segment,
  Sheet,
  SpendMix,
  SpringPressable,
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

function MonthHero({ data }: { data: Dash }) {
  const [scrub, setScrub] = useState<{ date: string; cents: number } | null>(null);
  const planned = data.budget.plannedCents > 0;
  const left = data.budget.remainingCents;
  const overPlan = planned && left < 0;
  const daysLeft = daysLeftInMonth();
  const dailyPace = planned && left > 0 ? Math.round(left / daysLeft) : null;

  const now = new Date();
  const range = monthRange(now.getFullYear(), now.getMonth() + 1);

  // Trajectory comparison line based on budget pace
  const baselinePoints =
    planned && data.budget.plannedCents > 0
      ? [
          { date: range.start, cents: 0 },
          { date: range.end, cents: data.budget.plannedCents },
        ]
      : undefined;

  let heroStatus: { label: string; tone: "good" | "warn" | "bad" | "neutral" } | null = null;
  if (!scrub) {
    if (overPlan) {
      heroStatus = { label: `Over by ${money(Math.abs(left))}`, tone: "bad" };
    } else if (dailyPace != null) {
      heroStatus = { label: `Safe: ${money(dailyPace)}/day`, tone: "good" };
    } else if (planned) {
      heroStatus = { label: "Budget complete", tone: "good" };
    } else {
      heroStatus = { label: "No budget set", tone: "neutral" };
    }
  }

  const facts = planned
    ? [
        {
          kicker: overPlan ? "Over plan" : "Left to spend",
          value: money(Math.abs(left)),
          color: overPlan ? colors.danger : colors.positive,
        },
        {
          kicker: "Daily pace",
          value: dailyPace != null ? `${money(dailyPace)}/d` : money(data.budget.plannedCents),
        },
        {
          kicker: data.cashFlow.savedCents < 0 ? "Over income" : "Saved",
          value: money(Math.abs(data.cashFlow.savedCents)),
          color: data.cashFlow.savedCents < 0 ? colors.danger : colors.positive,
        },
      ]
    : [
        { kicker: "Income", value: money(data.cashFlow.incomeCents) },
        {
          kicker: data.cashFlow.savedCents < 0 ? "Over income" : "Saved",
          value: money(Math.abs(data.cashFlow.savedCents)),
          color: data.cashFlow.savedCents < 0 ? colors.danger : colors.positive,
        },
      ];

  return (
    <Hero
      label={scrub ? dayLabel(scrub.date) : "Spent this month"}
      cents={scrub ? scrub.cents : data.cashFlow.spendingCents}
      points={data.spendSeries}
      baselinePoints={baselinePoints}
      onScrub={setScrub}
      live={scrub != null}
      status={heroStatus}
    >
      <Facts items={facts} />
    </Hero>
  );
}

export default function HomeScreen() {
  const [data, setData] = useState<Dash | null>(() => peek<Dash>("/api/dashboard") ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Quick Add Modal State
  const [adding, setAdding] = useState(false);
  const [addName, setAddName] = useState("");
  const [addAmount, setAddAmount] = useState("");
  const [addIncome, setAddIncome] = useState(false);
  const [addDate, setAddDate] = useState(todayISO());
  const [addCategory, setAddCategory] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [groups, setGroups] = useState<ChargeGroup[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);

  // Selected Transaction for Edit
  const [selectedTx, setSelectedTx] = useState<Dash["transactions"][0] | null>(null);

  const load = useCallback(() => {
    return Promise.all([
      read<Dash>("/api/dashboard"),
      api<{ groups: ChargeGroup[] }>("/api/categories").catch(() => ({ groups: [] })),
      api<{ accounts: { id: string; name: string }[] }>("/api/accounts").catch(() => ({ accounts: [] })),
    ])
      .then(([next, cats, accts]) => {
        setData(next);
        setGroups(cats.groups);
        setCategories(cats.groups.flatMap((g) => g.categories));
        setAccounts(accts.accounts);
        if (!accountId && accts.accounts.length > 0) {
          setAccountId(accts.accounts[0].id);
        }
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load home"));
  }, [accountId]);

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

  async function quickSave() {
    if (!addName.trim() || !addAmount.trim()) return;
    setBusy(true);
    try {
      const dollars = Number(addAmount);
      await api("/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          accountId: accountId || accounts[0]?.id,
          name: addName.trim(),
          amount: addIncome ? -Math.abs(dollars) : Math.abs(dollars),
          date: addDate || todayISO(),
          categoryId: addCategory || undefined,
        }),
      });
      setAddName("");
      setAddAmount("");
      setAdding(false);
      celebrate("Transaction added");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add transaction");
    } finally {
      setBusy(false);
    }
  }

  async function patchTx(id: string, body: Record<string, unknown>) {
    try {
      await api(`/api/transactions/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      celebrate("Updated");
      load();
    } catch {
      // Refresh to keep state in sync
      load();
    }
  }

  const today = todayISO();
  const now = new Date();
  const range = monthRange(now.getFullYear(), now.getMonth() + 1);
  const bills = (data?.recurring ?? []).filter((row) => !row.isIncome && row.nextDate >= today).slice(0, 4);
  const spendCats = (data?.spending ?? []).filter((row) => row.cents > 0);
  const restCents = spendCats.slice(5).reduce((sum, row) => sum + row.cents, 0);
  const spendRows =
    restCents > 0
      ? [...spendCats.slice(0, 5), { id: "rest", name: "Everything else", cents: restCents, color: "#8B939E" }]
      : spendCats;
  const latest = data?.transactions.slice(0, 5) ?? [];
  const suggestions = data?.suggestedSubscriptions?.length ?? 0;
  const left = data?.budget.remainingCents ?? 0;
  const plannedTotal = data?.budget.plannedCents ?? 0;
  const overPlan = Boolean(data && plannedTotal > 0 && left < 0);
  const budgetPct = plannedTotal > 0 ? Math.min(100, Math.round(((plannedTotal - left) / plannedTotal) * 100)) : 0;
  const nextBill = bills[0];

  return (
    <Screen framed onRefresh={load}>
      {error ? <Note>{error}</Note> : null}
      {!data && !error ? <Loading /> : null}
      {data ? (
        <>
          <MonthHero data={data} />

          {/* Robinhood-Style Tactile Quick-Action Pill Strip */}
          <View style={styles.actionStrip}>
            <SpringPressable
              onPress={() => {
                tapSelect();
                setAdding(true);
              }}
              style={styles.pillButton}
            >
              <Icon name="pencil" size={16} color={colors.ink} />
              <Text style={styles.pillText}>Quick Add</Text>
            </SpringPressable>

            {data.unreviewed.count > 0 ? (
              <SpringPressable
                onPress={() => {
                  tapSelect();
                  router.push("/review");
                }}
                style={[styles.pillButton, styles.pillBadgeActive]}
              >
                <Icon name="check" size={16} color={colors.positive} filled />
                <Text style={[styles.pillText, { color: colors.positive }]}>
                  {data.unreviewed.count} to review
                </Text>
              </SpringPressable>
            ) : null}

            <SpringPressable
              onPress={() => {
                tapSelect();
                router.push("/(app)/budget");
              }}
              style={styles.pillButton}
            >
              <Icon name="chart" size={16} color={colors.ink} />
              <Text style={styles.pillText}>
                {plannedTotal > 0 ? `${budgetPct}% of Plan` : "Set Budget"}
              </Text>
            </SpringPressable>

            {nextBill ? (
              <SpringPressable
                onPress={() => {
                  tapSelect();
                  router.push("/bills");
                }}
                style={styles.pillButton}
              >
                <Icon name="calendar" size={16} color={colors.ink} />
                <Text style={styles.pillText}>{inDaysPhrase(nextBill.nextDate)}</Text>
              </SpringPressable>
            ) : null}
          </View>

          {/* Monthly Plan Card */}
          {plannedTotal > 0 ? (
            <SpringPressable
              onPress={() => router.push("/(app)/budget")}
              style={[styles.cardButton, { backgroundColor: colors.card, borderColor: colors.line }]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 16, fontWeight: "600", letterSpacing: -0.3, color: colors.ink }}>
                  This month’s plan
                </Text>
                <Text style={{ fontSize: 13, color: overPlan ? colors.danger : colors.muted }}>
                  {overPlan
                    ? `${money(Math.abs(left))} over the plan`
                    : `${money(left)} left of ${money(plannedTotal)}`}
                </Text>
              </View>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.accentInk }}>Open ›</Text>
            </SpringPressable>
          ) : data.transactions.length > 0 ? (
            <SpringPressable
              onPress={() => router.push("/(app)/budget")}
              style={[styles.cardButton, { backgroundColor: colors.card, borderColor: colors.line }]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 16, fontWeight: "600", letterSpacing: -0.3, color: colors.ink }}>
                  Set a monthly plan
                </Text>
                <Text style={{ fontSize: 13, color: colors.muted }}>
                  See daily safe spending and track your monthly pace.
                </Text>
              </View>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.accentInk }}>Set ›</Text>
            </SpringPressable>
          ) : null}

          {/* Empty / Initial Account State */}
          {data.accountCount === 0 && data.transactions.length === 0 ? (
            <View style={{ gap: 12, alignItems: "center", paddingVertical: 20 }}>
              <Text style={{ fontSize: 17, fontWeight: "600", color: colors.ink }}>Start with one account</Text>
              <Button label="Add an account" onPress={() => router.push("/(app)/accounts")} />
              <Button label={busy ? "Loading…" : "Load sample data"} tone="quiet" onPress={() => void sample()} busy={busy} />
            </View>
          ) : (
            <>
              {/* Unreviewed banner fallback */}
              {data.unreviewed.count > 0 ? (
                <ReviewBanner label={categorizeLabel(data.unreviewed.count)} onPress={() => router.push("/review")} />
              ) : null}

              {/* Latest Transactions with Direct Swipe Actions */}
              {latest.length > 0 ? (
                <View style={{ gap: 8 }}>
                  <Section title="Latest" action="All Activity" onAction={() => router.push("/(app)/activity")} />
                  <Card>
                    {latest.map((tx, index) => {
                      const when = dayLabel(tx.date);
                      const whenShort = when === "Today" || when === "Yesterday" ? when : shortDate(tx.date);
                      const label = tx.merchantName || tx.name;
                      const flow = flowMoney(tx.amountCents);
                      return (
                        <SwipeRow
                          key={tx.id}
                          divided={index > 0}
                          peek={!tx.reviewed}
                          onPress={() => setSelectedTx(tx)}
                          actions={[
                            {
                              label: "Hide",
                              tone: "danger",
                              onPress: () => void patchTx(tx.id, { hidden: true }),
                            },
                            tx.reviewed
                              ? {
                                  label: "Edit",
                                  tone: "ink",
                                  onPress: () => setSelectedTx(tx),
                                }
                              : {
                                  label: "Done",
                                  tone: "accent",
                                  onPress: () => {
                                    celebrate("Reviewed");
                                    void patchTx(tx.id, { reviewed: true });
                                  },
                                },
                          ]}
                        >
                          <LedgerRow
                            name={label}
                            color={tx.category?.color}
                            meta={[whenShort, tx.category?.name, tx.pending ? "Pending" : ""].filter(Boolean).join(" · ")}
                            amount={flow.text}
                            amountColor={flow.color}
                          />
                        </SwipeRow>
                      );
                    })}
                  </Card>
                </View>
              ) : null}

              {/* Upcoming Bills */}
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
                      <Pressable
                        onPress={() => router.push("/bills")}
                        style={{
                          minHeight: 52,
                          paddingHorizontal: 16,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          borderTopWidth: bills.length ? 1 : 0,
                          borderTopColor: colors.line,
                        }}
                      >
                        <Text style={{ fontSize: 15, color: colors.ink }}>
                          {suggestions === 1 ? "1 charge looks like a bill" : `${suggestions} charges look like bills`}
                        </Text>
                        <Text style={{ fontSize: 15, fontWeight: "600", color: colors.accentInk }}>Check</Text>
                      </Pressable>
                    ) : null}
                  </Card>
                </View>
              ) : null}

              {/* Spend Breakdown ("Where it went") */}
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
                        style={{
                          minHeight: 52,
                          paddingHorizontal: 16,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                          borderTopWidth: index === 0 ? 0 : 1,
                          borderTopColor: colors.line,
                        }}
                      >
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: shelfColor(row.color) }} />
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

      {/* Quick Add Sheet */}
      {adding ? (
        <Sheet title="Quick Add" onClose={() => setAdding(false)}>
          <Field label="Merchant or Description" value={addName} onChangeText={setAddName} placeholder="e.g. Blue Bottle Coffee" />
          <Field label="Amount" value={addAmount} onChangeText={setAddAmount} keyboardType="decimal-pad" placeholder="0.00" />
          <Segment
            value={addIncome ? "in" : "out"}
            onChange={(val) => setAddIncome(val === "in")}
            options={[
              { value: "out", label: "Expense" },
              { value: "in", label: "Income" },
            ]}
          />
          <Section title="Category" />
          <Card>
            <View style={{ flexDirection: "row", flexWrap: "wrap", padding: 10, gap: 6 }}>
              {categories.slice(0, 10).map((cat) => {
                const selected = cat.id === addCategory;
                return (
                  <Pressable
                    key={cat.id}
                    onPress={() => {
                      tapSelect();
                      setAddCategory(cat.id);
                    }}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 999,
                      backgroundColor: selected ? colors.accentSoft : colors.fill,
                      borderWidth: 1,
                      borderColor: selected ? colors.accent : "transparent",
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: selected ? "700" : "500", color: selected ? colors.accentInk : colors.ink }}>
                      {cat.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>
          <Button label="Save Transaction" onPress={() => void quickSave()} busy={busy} block />
        </Sheet>
      ) : null}

      {/* Transaction Edit Sheet */}
      {selectedTx ? (
        <ChargeSheet
          tx={{
            ...selectedTx,
            categoryId: selectedTx.categoryId ?? null,
            account: selectedTx.account ?? null,
            hidden: selectedTx.hidden ?? false,
            notes: null,
            goalId: null,
            isTransfer: false,
            transferPairId: null,
            originalDescription: null,
            tags: [],
            splits: [],
          }}
          groups={groups}
          onClose={() => setSelectedTx(null)}
          onSaved={() => {
            setSelectedTx(null);
            celebrate("Saved");
            load();
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionStrip: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
  },
  pillButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  pillBadgeActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  pillText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.ink,
    letterSpacing: -0.1,
  },
  cardButton: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});
