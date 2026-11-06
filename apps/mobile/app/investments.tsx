import { useEffect, useMemo, useState } from "react";
import { useCached } from "../src/cached";
import { money, shelfColor } from "../src/format";
import { anchorRect, playFlight, useFlightArrival } from "../src/flight";
import { HoldingRow, type HoldingRowData } from "../src/holding";
import { useReduceMotion } from "../src/theme";
import { Back, Card, colors, Facts, Hero, LoadError, Loading, Note, Screen, Section, SpendMix } from "../src/ui";

type Holding = HoldingRowData & {
  security: { name?: string; ticker?: string; type?: string } | null;
  account: { name?: string } | null;
};

type Payload = {
  holdings: Holding[];
  totalCents?: number;
  gainCents?: number | null;
  series?: { date: string; cents: number }[];
};

const TONES = ["#14181f", "#5c6570", "#1b7a62", "#8fb9ad"];

export default function InvestmentsScreen() {
  const reduceMotion = useReduceMotion();
  const { data, error, reload: load } = useCached<Payload>("/api/investments", { fallback: "Could not load investments" });
  const [splitQueued, setSplitQueued] = useState(false);
  const rows = data?.holdings ?? null;
  const total = data ? (data.totalCents ?? data.holdings.reduce((sum, row) => sum + row.institutionValueCents, 0)) : 0;
  const gain = data?.gainCents ?? null;
  const series = data?.series ?? [];

  const shares = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows ?? []) {
      const key = row.security?.type || "Other";
      map.set(key, (map.get(key) ?? 0) + row.institutionValueCents);
    }
    return [...map.entries()].map(([label, cents], index) => ({ label, cents, color: TONES[index % TONES.length] }));
  }, [rows]);

  const charting = series.length > 1;

  function splitHoldings() {
    const hero = anchorRect("market.hero");
    if (!hero || !rows?.length) return;
    const pieces = rows.map((row, index) => ({
      key: `holding-${index}`,
      text: money(row.institutionValueCents),
      color: colors.ink,
      fontSize: 46,
      fontWeight: "700" as const,
      from: hero,
      toAnchor: `market.holding.${index}`,
      toFontSize: 16,
      delay: index * 28,
    }));
    playFlight({ id: "market-split", hide: pieces.map((piece) => piece.toAnchor), pieces }, reduceMotion);
  }

  useFlightArrival("market-open", reduceMotion, (plan) => {
    plan.onDone = () => setSplitQueued(true);
  });

  useEffect(() => {
    if (!splitQueued || !rows?.length) return;
    let cancelled = false;
    const holdings = rows;
    const started = Date.now();
    const tick = () => {
      if (cancelled) return;
      const hero = anchorRect("market.hero");
      if (!hero && Date.now() - started < 900) {
        requestAnimationFrame(tick);
        return;
      }
      if (!hero) return;
      setSplitQueued(false);
      const pieces = holdings.map((row, index) => ({
        key: `holding-${index}`,
        text: money(row.institutionValueCents),
        color: colors.ink,
        fontSize: 46,
        fontWeight: "700" as const,
        from: hero,
        toAnchor: `market.holding.${index}`,
        toFontSize: 16,
        delay: index * 28,
      }));
      playFlight({ id: "market-split", hide: pieces.map((piece) => piece.toAnchor), pieces }, reduceMotion);
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [splitQueued, rows, reduceMotion]);

  return (
    <Screen title="Investments" refresh={<Back />} onRefresh={load}>
      {error ? <LoadError message={error} onRetry={() => void load()} /> : null}
      {rows === null && !error ? <Loading /> : null}
      {rows ? (
        <>
          <Hero
            label="Market value"
            cents={total}
            points={charting ? series : undefined}
            shares={!charting && gain == null ? shares : undefined}
            figureAnchor="market.hero"
            onPressFigure={splitHoldings}
          >
            {gain != null ? (
              <Facts
                items={[
                  {
                    kicker: gain >= 0 ? "Gain" : "Loss",
                    value: money(Math.abs(gain)),
                    color: gain >= 0 ? colors.positive : colors.danger,
                  },
                ]}
              />
            ) : charting ? (
              <Facts items={shares.map((share) => ({ kicker: share.label, value: money(share.cents) }))} />
            ) : null}
          </Hero>
          <Section title="Holdings" />
          <Card>
            <SpendMix rows={shares.map((share) => ({ key: share.label, cents: share.cents, color: shelfColor(share.color) }))} />
            {rows.length === 0 ? <Note>No holdings yet.</Note> : null}
            {rows.map((row, index) => (
              <HoldingRow
                key={index}
                holding={row}
                divided={index > 0}
                valueAnchor={`market.holding.${index}`}
                onPressValue={() => {
                  const from = anchorRect(`market.holding.${index}`);
                  const hero = anchorRect("market.hero");
                  if (!from || !hero) return;
                  playFlight(
                    {
                      id: "holding-back",
                      hide: ["market.hero"],
                      pieces: [
                        {
                          key: "value",
                          text: money(row.institutionValueCents),
                          color: colors.ink,
                          fontSize: 16,
                          fontWeight: "700",
                          from,
                          to: hero,
                          toFontSize: 46,
                        },
                      ],
                    },
                    reduceMotion,
                  );
                }}
              />
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
