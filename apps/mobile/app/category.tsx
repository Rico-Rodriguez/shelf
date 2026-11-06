import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { load as read, peek } from "../src/api";
import { useCached } from "../src/cached";
import { Charge, ChargeGroup, ChargeSheet } from "../src/charge";
import { dayLabel, flowMoney, money, monthRange, shiftMonth, shortDate } from "../src/format";
import { tapMedium, tapPress, tapSelect } from "../src/haptic";
import { budgetPath, LimitSheet, MonthBars, type BudgetRow } from "../src/spend";
import { useTheme } from "../src/theme";
import { Back, LedgerRow, LoadError, Loading, RollingFigure, Screen, Section } from "../src/ui";

type Budget = { rows: BudgetRow[] };
const MONTHS = 6;

const monthName = (year: number, month: number) => new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long" });
const keyOf = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

/** What one purchase put into this category, counting only its share of a split. */
function shareIn(tx: Charge, categoryId: string): number {
  if (tx.splits?.length) return tx.splits.filter((part) => part.categoryId === categoryId).reduce((sum, part) => sum + Math.max(0, part.amountCents), 0);
  return tx.amountCents > 0 ? tx.amountCents : 0;
}

/** One category: this month, the last six, its limit and its purchases. */
export default function CategoryScreen() {
  const params = useLocalSearchParams<{ id?: string; name?: string; year?: string; month?: string }>();
  const { palette } = useTheme();
  const now = new Date();
  const id = params.id ?? "";
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth() + 1;
  const [picked, setPicked] = useState(() => ({
    year: Number(params.year) || thisYear,
    month: Number(params.month) || thisMonth,
  }));
  const [limitOpen, setLimitOpen] = useState(false);
  const [selected, setSelected] = useState<Charge | null>(null);
  const [groups, setGroups] = useState<ChargeGroup[]>(() => peek<{ groups: ChargeGroup[] }>("/api/categories")?.groups ?? []);

  const first = shiftMonth(thisYear, thisMonth, -(MONTHS - 1));
  const span = { start: monthRange(first.year, first.month).start, end: monthRange(thisYear, thisMonth).end };
  const txs = useCached<{ transactions: Charge[] }>(
    id ? `/api/transactions?categoryId=${encodeURIComponent(id)}&start=${span.start}&end=${span.end}&limit=500` : null,
    { fallback: "Could not load this category" },
  );
  const budget = useCached<Budget>(budgetPath(picked.year, picked.month), { keep: true });
  const row = budget.data?.rows.find((item) => item.category.id === id) ?? null;
  const name = row?.category.name ?? params.name ?? "Category";

  const months = useMemo(() => {
    const byKey = new Map<string, number>();
    for (const tx of txs.data?.transactions ?? []) {
      if (tx.hidden || tx.isTransfer) continue;
      const key = tx.date.slice(0, 7);
      byKey.set(key, (byKey.get(key) ?? 0) + shareIn(tx, id));
    }
    return Array.from({ length: MONTHS }, (_, i) => {
      const m = shiftMonth(first.year, first.month, i);
      const key = keyOf(m.year, m.month);
      return { ...m, key, cents: byKey.get(key) ?? 0, current: i === MONTHS - 1 };
    });
  }, [txs.data, id, first.year, first.month]);

  const pickedKey = keyOf(picked.year, picked.month);
  // While another month loads, the last budget stays up; only trust its figure once it is this month's.
  const fresh = budget.data !== undefined && peek(budgetPath(picked.year, picked.month)) === budget.data;
  // The budget's figure matches what Insights shows, so prefer it to adding up purchases here.
  const spent = fresh && row ? row.spentCents : (months.find((m) => m.key === pickedKey)?.cents ?? 0);
  const done = months.filter((m) => !m.current && m.cents > 0);
  const usual = row?.usualCents ?? (done.length ? Math.round(done.reduce((sum, m) => sum + m.cents, 0) / done.length) : null);
  const limit = row?.plannedCents ?? 0;
  const isThisMonth = picked.year === thisYear && picked.month === thisMonth;

  const purchases = useMemo(
    () =>
      (txs.data?.transactions ?? [])
        .filter((tx) => tx.date.startsWith(pickedKey) && !tx.hidden)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [txs.data, pickedKey],
  );
  const merchants = useMemo(() => {
    const totals = new Map<string, number>();
    for (const tx of purchases) {
      if (tx.isTransfer) continue;
      const label = tx.merchantName || tx.name;
      totals.set(label, (totals.get(label) ?? 0) + shareIn(tx, id));
    }
    return [...totals.entries()].filter(([, cents]) => cents > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [purchases, id]);

  let note = "";
  if (limit > 0) note = spent > limit ? `${money(spent - limit)} over your ${money(limit)} limit` : `${money(limit - spent)} under your ${money(limit)} limit`;
  else if (usual) note = `Usually ${money(usual)} a month`;
  const over = limit > 0 && spent > limit;

  function reload() {
    void read<{ groups: ChargeGroup[] }>("/api/categories").then((res) => setGroups(res.groups)).catch(() => undefined);
    return Promise.all([txs.reload(), budget.reload()]);
  }

  return (
    <Screen title={name} refresh={<Back />} onRefresh={reload}>
      {txs.error ? <LoadError message={txs.error} onRetry={() => void reload()} /> : null}

      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 15, fontWeight: "500", color: palette.muted }}>
          {isThisMonth ? "Spent this month" : `Spent in ${monthName(picked.year, picked.month)}`}
        </Text>
        <RollingFigure text={money(spent)} style={{ fontSize: 40, fontWeight: "700", letterSpacing: -1.5, color: palette.ink, fontVariant: ["tabular-nums"] }} />
        {note ? <Text style={{ fontSize: 14, fontWeight: "600", color: over ? palette.warn : palette.muted, fontVariant: ["tabular-nums"] }}>{note}</Text> : null}
        {limit > 0 ? (
          <View style={{ height: 4, borderRadius: 2, backgroundColor: palette.fill, overflow: "hidden", marginTop: 4 }}>
            <View style={{ width: `${Math.min(100, (spent / limit) * 100)}%`, height: 4, borderRadius: 2, backgroundColor: spent / limit >= 0.9 ? palette.warn : palette.ink }} />
          </View>
        ) : null}
      </View>

      {txs.loading ? (
        <Loading />
      ) : (
        <MonthBars
          months={months}
          picked={picked}
          onPick={(m) => {
            tapSelect();
            setPicked({ year: m.year, month: m.month });
          }}
        />
      )}

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          tapMedium();
          setLimitOpen(true);
        }}
        style={({ pressed }) => ({
          minHeight: 50,
          paddingHorizontal: 14,
          borderRadius: 14,
          borderCurve: "continuous",
          backgroundColor: palette.card,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text style={{ fontSize: 16, fontWeight: "500", color: palette.ink }}>Monthly limit</Text>
        <Text style={{ fontSize: 16, fontWeight: "600", color: limit > 0 ? palette.ink : palette.accentInk, fontVariant: ["tabular-nums"] }}>
          {limit > 0 ? money(limit) : "Add"}
        </Text>
      </Pressable>

      {merchants.length > 1 ? (
        <View style={{ gap: 4 }}>
          <Section title="Where it went" />
          {merchants.map(([label, cents], index) => (
            <LedgerRow
              key={label}
              bare
              divided={index > 0}
              name={label}
              meta={spent > 0 ? `${Math.round((cents / spent) * 100)}% of ${name}` : undefined}
              amount={money(cents)}
              onPress={() => {
                tapPress();
                router.push({ pathname: "/merchant", params: { name: label } });
              }}
            />
          ))}
        </View>
      ) : null}

      {txs.data ? (
        <View style={{ gap: 4 }}>
          <Section
            title="Purchases"
            action={purchases.length ? "See all" : undefined}
            onAction={() => {
              tapPress();
              const range = monthRange(picked.year, picked.month);
              router.push({ pathname: "/(app)/activity", params: { categoryId: id, start: range.start, end: range.end } });
            }}
          />
          {purchases.length === 0 ? (
            <Text style={{ fontSize: 15, color: palette.muted, lineHeight: 21 }}>Nothing in {monthName(picked.year, picked.month)}.</Text>
          ) : (
            purchases.slice(0, 30).map((tx, index) => {
              const when = dayLabel(tx.date);
              const flow = flowMoney(tx.amountCents);
              return (
                <LedgerRow
                  key={tx.id}
                  bare
                  divided={index > 0}
                  name={tx.merchantName || tx.name}
                  flag={tx.reviewed === false}
                  meta={[when === "Today" || when === "Yesterday" ? when : shortDate(tx.date), tx.pending ? "Pending" : ""].filter(Boolean).join(" · ")}
                  amount={flow.text}
                  amountColor={tx.pending ? palette.tertiary : flow.color}
                  onPress={() => setSelected(tx)}
                />
              );
            })
          )}
        </View>
      ) : null}

      {limitOpen ? (
        <LimitSheet
          row={row ?? { category: { id, name }, plannedCents: 0, spentCents: spent }}
          year={picked.year}
          month={picked.month}
          onClose={() => setLimitOpen(false)}
          onSaved={() => {
            setLimitOpen(false);
            void budget.reload();
          }}
        />
      ) : null}
      {selected ? (
        <ChargeSheet
          tx={selected}
          groups={groups}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            void reload();
          }}
        />
      ) : null}
    </Screen>
  );
}
