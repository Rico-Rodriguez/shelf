import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { api, load as read, peek, subscribeCache } from "../../src/api";
import { money, monthRange, netWorthCents, shelfColor, shiftMonth, todayISO, billsStillDueCents, type NetWorthAccount } from "../../src/format";
import { tapMedium, tapPress, tapSelect, tapSuccess } from "../../src/haptic";
import { Icon } from "../../src/icons";
import { useReduceMotion, useTheme } from "../../src/theme";
import { Button, Field, LoadError, Loading, Note, RollingFigure, Screen, Section, Sheet } from "../../src/ui";

type BudgetRow = {
  category: { id: string; name: string };
  group: { color: string } | null;
  plannedCents: number;
  spentCents: number;
  usualCents?: number | null;
};
type Budget = { rows: BudgetRow[]; expenseSpentCents: number };
type CashFlow = { series: { key: string; spending: number }[] };
type Bill = { id: string; amountCents: number; cadence: string; nextDate: string; isIncome: boolean; isActive: boolean };

const budgetPath = (year: number, month: number) => `/api/budget?year=${year}&month=${month}`;
const MONTHS = 6;
const CASH_FLOW = `/api/cash-flow?months=${MONTHS}`;

export default function InsightsScreen() {
  const { palette } = useTheme();
  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth() + 1;
  const [picked, setPicked] = useState({ year: thisYear, month: thisMonth });
  const path = budgetPath(picked.year, picked.month);
  const [budget, setBudget] = useState<Budget | null>(() => peek<Budget>(path) ?? null);
  const [flow, setFlow] = useState<CashFlow | null>(() => peek<CashFlow>(CASH_FLOW) ?? null);
  const [worth, setWorth] = useState<number | null>(() => {
    const cached = peek<{ accounts: NetWorthAccount[] }>("/api/accounts");
    return cached ? netWorthCents(cached.accounts) : null;
  });
  const [bills, setBills] = useState<Bill[] | null>(() => peek<{ recurrences: Bill[] }>("/api/recurring")?.recurrences ?? null);
  const [goalCount, setGoalCount] = useState<number | null>(() => peek<{ goals: unknown[] }>("/api/goals")?.goals.length ?? null);
  const [error, setError] = useState<string | null>(null);
  const [limitFor, setLimitFor] = useState<BudgetRow | null>(null);

  const load = useCallback(() => {
    void read<CashFlow>(CASH_FLOW).then(setFlow).catch(() => undefined);
    void read<{ accounts: NetWorthAccount[] }>("/api/accounts")
      .then((res) => setWorth(netWorthCents(res.accounts)))
      .catch(() => undefined);
    void read<{ recurrences: Bill[] }>("/api/recurring")
      .then((res) => setBills(res.recurrences))
      .catch(() => undefined);
    void read<{ goals: unknown[] }>("/api/goals")
      .then((res) => setGoalCount(res.goals.length))
      .catch(() => undefined);
    return read<Budget>(path)
      .then((next) => {
        setBudget(next);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load insights"));
  }, [path]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEffect(() => {
    setBudget(peek<Budget>(path) ?? null);
    return subscribeCache<Budget>(path, (next) => next && setBudget(next));
  }, [path]);

  const months = useMemo(() => {
    const byKey = new Map((flow?.series ?? []).map((row) => [row.key, row.spending]));
    return Array.from({ length: MONTHS }, (_, i) => {
      const m = shiftMonth(thisYear, thisMonth, i - (MONTHS - 1));
      const key = `${m.year}-${String(m.month).padStart(2, "0")}`;
      const current = i === MONTHS - 1;
      const cents = current && budget && picked.year === thisYear && picked.month === thisMonth ? budget.expenseSpentCents : (byKey.get(key) ?? 0);
      return { ...m, key, cents, current };
    });
  }, [flow, budget, thisYear, thisMonth, picked]);

  const complete = months.filter((m) => !m.current && m.cents > 0);
  const average = complete.length ? Math.round(complete.reduce((sum, m) => sum + m.cents, 0) / complete.length) : null;
  const pickedRow = months.find((m) => m.year === picked.year && m.month === picked.month);
  const pickedName = new Date(picked.year, picked.month - 1, 1).toLocaleDateString("en-US", { month: "long" });
  const isThisMonth = picked.year === thisYear && picked.month === thisMonth;

  const rows = (budget?.rows ?? [])
    .filter((row) => row.spentCents > 0 || row.plannedCents > 0)
    .sort((a, b) => b.spentCents - a.spentCents);
  const billsDue = bills ? billsStillDueCents(bills, thisYear, thisMonth) : null;
  const nextBill = (bills ?? [])
    .filter((bill) => bill.isActive && !bill.isIncome && bill.nextDate >= todayISO())
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate))[0];

  function openCategory(row: BudgetRow) {
    tapPress();
    const range = monthRange(picked.year, picked.month);
    router.push({ pathname: "/(app)/activity", params: { categoryId: row.category.id, start: range.start, end: range.end } });
  }

  return (
    <Screen framed onRefresh={load}>
      {error ? <LoadError message={error} onRetry={() => void load()} /> : null}

      <View style={{ gap: 14, marginTop: -4 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 15, fontWeight: "500", color: palette.muted }}>{isThisMonth ? "Average month" : `Spent in ${pickedName}`}</Text>
            <RollingFigure
              text={isThisMonth ? (average == null ? "—" : money(average)) : money(pickedRow?.cents ?? 0)}
              style={{ fontSize: 32, fontWeight: "700", letterSpacing: -1.1, color: palette.ink, fontVariant: ["tabular-nums"] }}
            />
          </View>
          <Text style={{ fontSize: 13, fontWeight: "500", color: palette.muted, marginBottom: 6 }}>Last 6 months</Text>
        </View>
        <MonthBars
          months={months}
          picked={picked}
          onPick={(m) => {
            tapSelect();
            setPicked({ year: m.year, month: m.month });
          }}
        />
      </View>

      <View style={{ gap: 10 }}>
        <Section title="Categories" trailing={pickedName} />
        {!budget && !error ? <Loading /> : null}
        {budget && rows.length === 0 ? (
          <Text style={{ fontSize: 15, color: palette.muted, lineHeight: 21 }}>Nothing spent in {pickedName} yet.</Text>
        ) : null}
        <View style={{ gap: 4 }}>
          {rows.map((row) => (
            <CategoryRow key={row.category.id} row={row} onPress={() => openCategory(row)} onLimit={() => {
              tapMedium();
              setLimitFor(row);
            }} />
          ))}
        </View>
        {rows.length ? (
          <Text style={{ fontSize: 13, color: palette.tertiary, lineHeight: 18 }}>Press and hold a category to give it a monthly limit.</Text>
        ) : null}
      </View>

      <View style={{ gap: 10 }}>
        <Section title="Your money" action="More" onAction={() => router.push("/money")} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <Tile title="Net worth" value={worth == null ? "—" : money(worth)} onPress={() => router.push("/accounts")} />
          <Tile
            title="Bills left this month"
            value={billsDue == null ? "—" : money(billsDue)}
            detail={nextBill ? `Next: ${new Date(`${nextBill.nextDate}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : undefined}
            onPress={() => router.push("/bills")}
          />
          <Tile title="Goals" value={goalCount == null ? "—" : goalCount === 0 ? "Add one" : `${goalCount} active`} onPress={() => router.push("/goals")} />
          <Tile title="Cash flow" value="Income vs. spending" small onPress={() => router.push("/cash-flow")} />
          <Tile title="Investments" value="Holdings" small onPress={() => router.push("/investments")} />
          <Tile title="Merchants" value="Where it went" small onPress={() => router.push("/insights")} />
        </View>
      </View>

      {limitFor ? (
        <LimitSheet
          row={limitFor}
          year={picked.year}
          month={picked.month}
          onClose={() => setLimitFor(null)}
          onSaved={() => {
            setLimitFor(null);
            void load();
          }}
        />
      ) : null}
    </Screen>
  );
}

function MonthBars({
  months,
  picked,
  onPick,
}: {
  months: { year: number; month: number; key: string; cents: number; current: boolean }[];
  picked: { year: number; month: number };
  onPick: (m: { year: number; month: number }) => void;
}) {
  const { palette } = useTheme();
  const reduceMotion = useReduceMotion();
  const grow = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const top = Math.max(1, ...months.map((m) => m.cents));
  const signature = months.map((m) => m.cents).join(",");
  useEffect(() => {
    if (reduceMotion) {
      grow.setValue(1);
      return;
    }
    grow.setValue(0);
    Animated.spring(grow, { toValue: 1, useNativeDriver: true, stiffness: 160, damping: 18, mass: 0.9 }).start();
  }, [signature, reduceMotion, grow]);
  const track = 96;
  return (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-end" }}>
      {months.map((m) => {
        const on = m.year === picked.year && m.month === picked.month;
        const h = Math.max(6, (m.cents / top) * track);
        return (
          <Pressable
            key={m.key}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${new Date(m.year, m.month - 1, 1).toLocaleDateString("en-US", { month: "long" })}, ${money(m.cents)}`}
            onPress={() => onPick(m)}
            style={{ flex: 1, alignItems: "center", gap: 6 }}
          >
            <View style={{ height: track, width: "100%", justifyContent: "flex-end" }}>
              <Animated.View
                style={{
                  height: h,
                  borderRadius: 8,
                  borderCurve: "continuous",
                  backgroundColor: on ? palette.positive : palette.fill,
                  transform: [{ translateY: grow.interpolate({ inputRange: [0, 1], outputRange: [h, 0] }) }, { scaleY: grow.interpolate({ inputRange: [0, 1], outputRange: [0.01, 1] }) }],
                }}
              />
            </View>
            <Text style={{ fontSize: 12, fontWeight: on ? "700" : "600", color: on ? palette.positive : palette.muted }}>
              {new Date(m.year, m.month - 1, 1).toLocaleDateString("en-US", { month: "short" })}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function CategoryRow({ row, onPress, onLimit }: { row: BudgetRow; onPress: () => void; onLimit: () => void }) {
  const { palette } = useTheme();
  const tint = shelfColor(row.group?.color);
  const limit = row.plannedCents;
  const share = limit > 0 ? row.spentCents / limit : 0;
  const near = share >= 0.9;
  const usual = row.usualCents ?? null;
  let detail = "";
  if (limit > 0) detail = row.spentCents > limit ? `${money(row.spentCents - limit)} over your ${money(limit)} limit` : `of ${money(limit)} limit`;
  else if (usual && usual > 0) detail = `Usually ${money(usual)} a month`;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLimit}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityHint="Press and hold to set a monthly limit"
      style={({ pressed }) => ({ flexDirection: "row", gap: 12, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}
    >
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: `${tint}22`, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: tint }} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4, justifyContent: "center" }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 16, fontWeight: "500", color: palette.ink, letterSpacing: -0.3 }}>
            {row.category.name}
          </Text>
          <Text style={{ fontSize: 16, fontWeight: "600", color: palette.ink, letterSpacing: -0.3, fontVariant: ["tabular-nums"] }}>{money(row.spentCents)}</Text>
        </View>
        {limit > 0 ? (
          <View style={{ height: 4, borderRadius: 2, backgroundColor: palette.fill, overflow: "hidden" }}>
            <View style={{ width: `${Math.min(100, share * 100)}%`, height: 4, borderRadius: 2, backgroundColor: near ? palette.warn : palette.ink }} />
          </View>
        ) : null}
        {detail ? (
          <Text style={{ fontSize: 13, color: limit > 0 && row.spentCents > limit ? palette.warn : palette.muted, fontVariant: ["tabular-nums"] }}>{detail}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function Tile({ title, value, detail, small, onPress }: { title: string; value: string; detail?: string; small?: boolean; onPress: () => void }) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        tapPress();
        onPress();
      }}
      style={({ pressed }) => ({
        flexBasis: "47%",
        flexGrow: 1,
        minHeight: 78,
        padding: 14,
        gap: 3,
        borderRadius: 18,
        borderCurve: "continuous",
        backgroundColor: palette.card,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontSize: 13, fontWeight: "600", color: palette.muted }} numberOfLines={1}>
          {title}
        </Text>
        <Icon name="chevron" size={12} color={palette.tertiary} />
      </View>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={{ fontSize: small ? 15 : 19, fontWeight: small ? "600" : "700", color: palette.ink, letterSpacing: -0.4, fontVariant: ["tabular-nums"] }}
      >
        {value}
      </Text>
      {detail ? <Text style={{ fontSize: 12, fontWeight: "500", color: palette.muted }}>{detail}</Text> : null}
    </Pressable>
  );
}

function LimitSheet({ row, year, month, onClose, onSaved }: { row: BudgetRow; year: number; month: number; onClose: () => void; onSaved: () => void }) {
  const { palette } = useTheme();
  const [value, setValue] = useState(row.plannedCents > 0 ? String(Math.round(row.plannedCents / 100)) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cents = Math.round(Number(value.replace(/[^0-9.]/g, "")) * 100);

  async function save(next: number) {
    setBusy(true);
    setError(null);
    try {
      await api("/api/budget", { method: "PUT", body: JSON.stringify({ year, month, items: [{ categoryId: row.category.id, plannedCents: next }] }) });
      tapSuccess();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the limit");
      setBusy(false);
    }
  }

  return (
    <Sheet title={row.category.name} subtitle={`Spent ${money(row.spentCents)} so far`} onClose={onClose} fit>
      <View style={{ gap: 14 }}>
        <Text style={{ fontSize: 15, lineHeight: 21, color: palette.muted }}>
          A limit adds a thin bar to this category that turns orange near the end. It carries into next month.
        </Text>
        <Field label="Monthly limit" value={value} onChangeText={setValue} keyboardType="decimal-pad" placeholder="$0" />
        {error ? <Note tone="danger">{error}</Note> : null}
        <Button label="Save limit" busy={busy} block onPress={() => (cents > 0 && !busy ? void save(cents) : undefined)} />
        {row.plannedCents > 0 ? <Button label="Remove limit" tone="quiet" block onPress={() => (!busy ? void save(0) : undefined)} /> : null}
      </View>
    </Sheet>
  );
}

