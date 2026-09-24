import { useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { tapSelect } from "./haptic";
import { colors } from "./theme";

function smoothLine(coords: { x: number; y: number }[]) {
  if (coords.length === 0) return "";
  let d = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const current = coords[i];
    const next = coords[i + 1];
    const mid = (current.x + next.x) / 2;
    d += ` C ${mid} ${current.y} ${mid} ${next.y} ${next.x} ${next.y}`;
  }
  return d;
}

function pathLength(coords: { x: number; y: number }[]) {
  let length = 0;
  for (let i = 1; i < coords.length; i++) {
    length += Math.hypot(coords[i].x - coords[i - 1].x, coords[i].y - coords[i - 1].y);
  }
  return Math.max(length * 1.15, 1);
}

export function SpendChart({
  points,
  onScrub,
  reference,
  caption,
  color = colors.accent,
}: {
  points: { date: string; cents: number }[];
  onScrub?: (point: { date: string; cents: number } | null) => void;
  reference?: { cents: number; label: string };
  caption?: string;
  color?: string;
}) {
  const series = points.length > 0 && points[0].cents !== 0 ? [{ date: points[0].date, cents: 0 }, ...points] : points;
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [reveal, setReveal] = useState(0);
  const lastIndex = useRef<number | null>(null);
  const height = 156;
  const signature = series.map((point) => point.cents).join(",");

  useEffect(() => {
    let frame = 0;
    const started = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - started) / 720);
      const eased = 1 - Math.pow(1 - t, 3);
      setReveal(eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [signature]);

  const geometry = useMemo(() => {
    if (series.length < 2 || width <= 0) return null;
    const values = series.map((point) => point.cents);
    if (reference) values.push(reference.cents);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const raw = max - min;
    const pad = raw === 0 ? Math.max(Math.abs(max) * 0.22, 1) : raw * 0.16;
    const lo = min - pad;
    const hi = max + pad;
    const span = hi - lo || 1;
    const insetX = 8;
    const insetY = 16;
    const xOf = (index: number) => (series.length <= 1 ? width / 2 : insetX + (index / (series.length - 1)) * (width - insetX * 2));
    const yOf = (cents: number) => insetY + ((hi - cents) / span) * (height - insetY * 2);
    const coords = series.map((point, index) => ({ x: xOf(index), y: yOf(point.cents) }));
    const line = smoothLine(coords);
    const area = `${line} L ${coords[coords.length - 1].x} ${height} L ${coords[0].x} ${height} Z`;
    return { coords, line, area, length: pathLength(coords), refY: reference ? yOf(reference.cents) : null };
  }, [series, width, reference, height]);

  if (series.length < 2) return null;

  function pick(x: number) {
    if (!width || !onScrub) return;
    const index = Math.round(Math.min(1, Math.max(0, x / width)) * (series.length - 1));
    if (lastIndex.current !== index) {
      lastIndex.current = index;
      tapSelect();
    }
    setActive(index);
    onScrub(series[index] ?? null);
  }

  const dot = geometry?.coords[active ?? geometry.coords.length - 1];
  const gradientId = `wash-${color.replace("#", "")}`;

  return (
    <View
      style={{ height, marginHorizontal: -18, marginTop: 6 }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => Boolean(onScrub)}
      onMoveShouldSetResponder={() => Boolean(onScrub)}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(event) => pick(event.nativeEvent.locationX)}
      onResponderMove={(event) => pick(event.nativeEvent.locationX)}
      onResponderRelease={() => {
        lastIndex.current = null;
        setActive(null);
        onScrub?.(null);
      }}
      onResponderTerminate={() => {
        lastIndex.current = null;
        setActive(null);
        onScrub?.(null);
      }}
    >
      {geometry && width > 0 ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity="0.32" />
              <Stop offset="0.72" stopColor={color} stopOpacity="0.06" />
              <Stop offset="1" stopColor={color} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          {geometry.refY != null ? (
            <Line x1={0} x2={width} y1={geometry.refY} y2={geometry.refY} stroke={colors.tertiary} strokeDasharray="3 5" strokeWidth={1} />
          ) : null}
          <Path d={geometry.area} fill={`url(#${gradientId})`} opacity={0.35 + reveal * 0.65} />
          <Path
            d={geometry.line}
            stroke={color}
            strokeWidth={2.5}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={geometry.length}
            strokeDashoffset={geometry.length * (1 - reveal)}
          />
          {active != null && dot ? <Line x1={dot.x} x2={dot.x} y1={8} y2={height - 4} stroke={colors.ink} strokeOpacity={0.28} strokeWidth={1} /> : null}
          {dot ? (
            <>
              <Circle cx={dot.x} cy={dot.y} r={active == null ? 4.5 : 6.5} fill={color} />
              <Circle cx={dot.x} cy={dot.y} r={active == null ? 2.2 : 3} fill={colors.card} />
            </>
          ) : null}
        </Svg>
      ) : null}
      {reference && geometry?.refY != null ? (
        <Text pointerEvents="none" style={{ position: "absolute", top: geometry.refY - 8, left: 10, fontSize: 10, fontWeight: "700", letterSpacing: 1, color: colors.tertiary, textTransform: "uppercase" }}>
          {reference.label}
        </Text>
      ) : null}
      {caption ? (
        <Text pointerEvents="none" style={{ position: "absolute", top: 2, right: 10, fontSize: 10, fontWeight: "700", letterSpacing: 1, color: colors.tertiary, textTransform: "uppercase" }}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

export function GroupedBars({
  points,
  series,
  onPress,
}: {
  points: { label: string; values: Record<string, number> }[];
  series: { key: string; color: string }[];
  onPress?: (label: string) => void;
}) {
  const [width, setWidth] = useState(0);
  const height = 168;
  const max = Math.max(1, ...points.flatMap((point) => series.map((item) => point.values[item.key] ?? 0)));
  const gap = 10;
  const groupWidth = points.length > 0 && width > 0 ? (width - gap * (points.length - 1)) / points.length : 0;
  const barWidth = Math.max(4, Math.min(10, (groupWidth - 4) / Math.max(series.length, 1)));

  return (
    <View style={{ gap: 10 }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <View style={{ height, flexDirection: "row" }}>
        {width > 0
          ? points.map((point, index) => {
              const left = index * (groupWidth + gap);
              const cluster = series.length * barWidth + Math.max(0, series.length - 1) * 2;
              const start = left + (groupWidth - cluster) / 2;
              return (
                <View key={point.label} style={{ position: "absolute", left, width: groupWidth, height }} onTouchEnd={() => onPress?.(point.label)}>
                  <Svg width={groupWidth} height={height}>
                    {series.map((item, bar) => {
                      const value = point.values[item.key] ?? 0;
                      const barHeight = Math.max(3, (value / max) * (height - 4));
                      return (
                        <Rect
                          key={item.key}
                          x={start - left + bar * (barWidth + 2)}
                          y={height - barHeight}
                          width={barWidth}
                          height={barHeight}
                          rx={3}
                          fill={item.color}
                        />
                      );
                    })}
                  </Svg>
                </View>
              );
            })
          : null}
      </View>
      <View style={{ flexDirection: "row" }}>
        {points.map((point) => (
          <Text key={point.label} numberOfLines={1} style={{ flex: 1, textAlign: "center", fontSize: 10, color: colors.tertiary }}>
            {point.label}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 16 }}>
        {series.map((item) => (
          <View key={item.key} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: item.color }} />
            <Text style={{ fontSize: 12, fontWeight: "500", color: colors.tertiary }}>{item.key}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
