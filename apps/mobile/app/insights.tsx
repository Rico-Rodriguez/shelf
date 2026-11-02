import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api } from "../src/api";
import { addDays, money, monthLabel, monthRange, shelfColor, shortDate, todayISO, versusShort } from "../src/format";
import { anchorRect, setCategoryReturn, stageFlight, useFlightHidden, useMeasuredAnchor } from "../src/flight";
import { useReduceMotion } from "../src/theme";
import { Back, Card, colors, Hero, LoadError, Loading, MonthNav, Note, Progress, Screen, Section, Segment, SpendMix } from "../src/ui";

type Report = {
  year: number;
  month: number;
  incomeCents: number;
  spendingCents: number;
  usualSpentCents?: number | null;
  byCategory: { id: string; name: string; cents: number; color?: string; avgCents?: number }[];
  byMerchant?: { name: string; cents: number }[];
  netWorth: { netWorthCents: number };
  snapshots?: { date: string; netWorthCents: number }[];
};

export default function InsightsScreen() {
  const now = new Date();
  const reduceMotion = useReduceMotion();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scrub, setScrub] = useState<{ date: string; cents: number } | null>(null);
  const [span, setSpan] = useState<"90" | "365" | "all">("365");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    void api<Report>(`/api/reports?year=${cursor.year}&month=${cursor.month}`)
      .then((next) => {
        setData(next);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load insights"));
  }, [cursor, attempt]);

  const cutoff = span === "all" ? null : addDays(todayISO(), span === "90" ? -90 : -365);
  const points = (data?.snapshots ?? [])
    .filter((row) => !cutoff || row.date >= cutoff)
    .map((row) => ({ date: row.date, cents: row.netWorthCents }));
  const latest = points.length ? points[points.length - 1] : null;
  const shown = scrub?.cents ?? latest?.cents ?? data?.netWorth.netWorthCents ?? 0;
  const moved = points.length >= 2 ? points[points.length - 1].cents - points[0].cents : null;
  const movedStatus = moved == null || Math.abs(moved) < 100 ? null : moved > 0 ? `Up ${money(moved)}` : `Down ${money(-moved)}`;
  const range = data ? monthRange(data.year, data.month) : null;
  const total = (data?.byCategory ?? []).reduce((sum, row) => sum + row.cents, 0) || 1;
  const note = data ? versusShort(data.spendingCents, data.usualSpentCents ?? null) : null;

  function openCategory(id: string, kind: "slice" | "row") {
    const category = data?.byCategory.find((row) => (row.id || row.name) === id);
    if (!category?.id || !range) return;
    const anchor = kind === "slice" ? `insights.slice.${category.id}` : `insights.row.${category.id}`;
    const from = anchorRect(anchor);
    if (from) {
      setCategoryReturn(anchor, from);
      stageFlight(
        {
          id: "category-open",
          hide: ["activity.category.title", "activity.category.amount"],
          pieces: [
            { key: "swatch", kind: "fill", color: shelfColor(category.color), fontSize: 8, from, toAnchor: "activity.category.banner" },
            { key: "name", text: category.name, color: colors.ink, fontSize: 16, fontWeight: "600", from, toAnchor: "activity.category.title", toFontSize: 22 },
            { key: "amount", text: money(category.cents), color: colors.ink, fontSize: 16, fontWeight: "700", from, toAnchor: "activity.category.amount", toFontSize: 28 },
          ],
        },
        reduceMotion,
      );
    }
    router.push({ pathname: "/(app)/activity", params: { categoryId: category.id, start: range.start, end: range.end } });
  }

  return (
    <Screen title="Insights" refresh={<Back />}>
      <MonthNav
        year={cursor.year}
        month={cursor.month}
        label={monthLabel(cursor.year, cursor.month)}
        onChange={(year, month) => {
          setScrub(null);
          setCursor({ year, month });
        }}
      />
      {error ? <LoadError message={error} onRetry={() => setAttempt((n) => n + 1)} /> : null}
      {!data && !error ? <Loading /> : null}
      {data ? (
        <>
          <Segment
            value={span}
            onChange={(value) => {
              setScrub(null);
              setSpan(value as "90" | "365" | "all");
            }}
            options={[
              { value: "90", label: "3M" },
              { value: "365", label: "1Y" },
              { value: "all", label: "All" },
            ]}
          />
          <Hero
            label={scrub ? shortDate(scrub.date) : "Net worth"}
            cents={shown}
            tone={shown < 0 ? "bad" : undefined}
            status={!scrub && movedStatus ? { label: movedStatus, tone: (moved ?? 0) > 0 ? "good" : "bad" } : null}
            points={points.length > 1 ? points : undefined}
            caption="Net worth"
            onScrub={setScrub}
            live={scrub != null}
          />
          <Section title="Spending" trailing={`${money(data.spendingCents)}${note ? ` · ${note}` : ""}`} />
          <Card>
            <SpendMix
              rows={data.byCategory.map((category) => ({ key: category.id || category.name, cents: category.cents, color: shelfColor(category.color) }))}
              anchorFor={(key) => `insights.slice.${key}`}
              onSlice={(key) => openCategory(key, "slice")}
            />
            {data.byCategory.length === 0 ? <Note>Nothing this month.</Note> : null}
            {data.byCategory.map((category, index) => (
              <InsightCategory
                key={category.id || category.name}
                id={category.id || category.name}
                name={category.name}
                cents={category.cents}
                usual={category.avgCents}
                color={shelfColor(category.color)}
                divided={index > 0}
                max={total}
                onPress={() => openCategory(category.id || category.name, "row")}
              />
            ))}
          </Card>
          {(data.byMerchant ?? []).length ? (
            <View style={{ gap: 8 }}>
              <Section title="Merchants" />
              <Card>
                {(data.byMerchant ?? []).map((row, index) => (
                  <Pressable
                    key={row.name}
                    onPress={() => router.push({ pathname: "/merchant", params: { name: row.name } })}
                    style={{ minHeight: 52, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}
                  >
                    <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, color: colors.ink }}>{row.name}</Text>
                    <Text style={{ fontWeight: "600" }}>{money(row.cents)}</Text>
                  </Pressable>
                ))}
              </Card>
            </View>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function InsightCategory({
  id,
  name,
  cents,
  usual,
  color,
  divided,
  max,
  onPress,
}: {
  id: string;
  name: string;
  cents: number;
  usual?: number;
  color: string;
  divided: boolean;
  max: number;
  onPress: () => void;
}) {
  const row = useMeasuredAnchor(`insights.row.${id}`, { text: name, color: colors.ink, fontSize: 16 });
  const opacity = useFlightHidden(`insights.row.${id}`);
  return (
    <Pressable
      {...row}
      onPress={onPress}
      style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8, borderTopWidth: divided ? 1 : 0, borderTopColor: colors.line, opacity }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontSize: 16, color: colors.ink }}>{name}</Text>
          {usual ? <Text style={{ fontSize: 12, color: colors.muted }}>{`Usual ${money(usual)}`}</Text> : null}
        </View>
        <Text style={{ fontWeight: "600", color: colors.ink }}>{money(cents)}</Text>
      </View>
      <Progress value={cents} max={max} color={color} />
    </Pressable>
  );
}
