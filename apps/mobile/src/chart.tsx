import { useEffect, useId, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import Svg, { Circle, ClipPath, Defs, G, Line, LinearGradient, Path, Rect, Stop, type GProps } from "react-native-svg";
import { money, shortDate } from "./format";
import { tapTick } from "./haptic";
import { useScrollLock } from "./scroll";
import { colors, useReduceMotion, themedStyles } from "./theme";

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
  const styles = useStyles();
  const series = points.length > 0 && points[0].cents !== 0 ? [{ date: points[0].date, cents: 0 }, ...points] : points;
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const lineRef = useRef<Path>(null);
  const clipRef = useRef<Rect>(null);
  const tipRef = useRef<G<GProps>>(null);
  const coordsRef = useRef<{ x: number; y: number }[]>([]);
  const lastIndex = useRef<number | null>(null);
  const setScrollLocked = useScrollLock();
  const reduceMotion = useReduceMotion();
  const [tipOn, setTipOn] = useState(false);
  const height = 160;
  const signature = series.map((point) => point.cents).join(",");
  const clipId = `reveal-${useId().replace(/:/g, "")}`;

  const geometry = useMemo(() => {
    if (series.length < 2 || width <= 0) return null;
    // One dollar axis for the spend and the pace mark. Zero stays on the floor.
    // The top is the higher of the two, with air above it. Fitting the series
    // on its own pins the line to the pace rule no matter how small the spend is.
    const seriesMax = series.reduce((max, point) => Math.max(max, point.cents), 0);
    const seriesMin = series.reduce((min, point) => Math.min(min, point.cents), 0);
    const pace = Math.max(0, reference?.cents ?? 0);
    const peak = Math.max(seriesMax, pace, 1);
    const floor = Math.min(0, seriesMin);
    const lo = floor;
    const hi = floor + (peak - floor) * 1.12;
    const span = hi - lo || 1;
    const insetX = 12;
    const insetY = 20;

    const xOf = (index: number) =>
      series.length <= 1 ? width / 2 : insetX + (index / (series.length - 1)) * (width - insetX * 2);
    const yOf = (cents: number) => insetY + ((hi - cents) / span) * (height - insetY * 2);

    const coords = series.map((point, index) => ({ x: xOf(index), y: yOf(point.cents) }));
    const line = smoothLine(coords);
    const area = `${line} L ${coords[coords.length - 1].x} ${height} L ${coords[0].x} ${height} Z`;

    return {
      coords,
      line,
      area,
      length: pathLength(coords),
      refY: reference ? yOf(reference.cents) : null,
    };
  }, [series, width, reference, height]);

  const lineLength = geometry?.length ?? 0;
  coordsRef.current = geometry?.coords ?? [];

  useEffect(() => {
    if (!lineLength || width <= 0) return;
    if (reduceMotion) {
      lineRef.current?.setNativeProps?.({ strokeDashoffset: 0 });
      clipRef.current?.setNativeProps?.({ width });
      setTipOn(true);
      return;
    }
    setTipOn(false);
    let frame = 0;
    const started = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - started) / 640);
      const eased = 1 - Math.pow(1 - t, 3);
      lineRef.current?.setNativeProps?.({ strokeDashoffset: lineLength * (1 - eased) });
      const coords = coordsRef.current;
      const index = coords.length > 1 ? Math.round(eased * (coords.length - 1)) : 0;
      const reveal = coords[index]?.x ?? eased * width;
      clipRef.current?.setNativeProps?.({ width: Math.max(reveal, 0) });
      if (t < 1) frame = requestAnimationFrame(tick);
      else setTipOn(true);
    };
    lineRef.current?.setNativeProps?.({ strokeDashoffset: lineLength });
    clipRef.current?.setNativeProps?.({ width: 0 });
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [lineLength, signature, reduceMotion, width]);

  useEffect(() => {
    if (!tipOn || reduceMotion) return;
    let frame = 0;
    const started = Date.now();
    const step = () => {
      const t = Math.min(1, (Date.now() - started) / 720);
      const dip = Math.sin(t * Math.PI);
      tipRef.current?.setNativeProps?.({ opacity: 1 - dip * 0.55 });
      if (t < 1) frame = requestAnimationFrame(step);
      else tipRef.current?.setNativeProps?.({ opacity: 1 });
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [tipOn, reduceMotion]);

  useEffect(() => {
    return () => {
      setScrollLocked(false);
    };
  }, [setScrollLocked]);

  function pick(x: number) {
    if (!width || series.length < 2) return;
    const index = Math.round(Math.min(1, Math.max(0, x / width)) * (series.length - 1));
    if (lastIndex.current !== index) {
      lastIndex.current = index;
      tapTick();
    }
    setActive(index);
    onScrub?.(series[index] ?? null);
  }

  function endScrub() {
    lastIndex.current = null;
    setActive(null);
    try {
      onScrub?.(null);
    } finally {
      setScrollLocked(false);
    }
  }

  const panGesture = Gesture.Pan()
    .activeOffsetX([-3, 3])
    .failOffsetY([-12, 12])
    .onStart((event) => {
      runOnJS(setScrollLocked)(true);
      runOnJS(pick)(event.x);
    })
    .onUpdate((event) => {
      runOnJS(pick)(event.x);
    })
    .onFinalize(() => {
      runOnJS(endScrub)();
    });

  const tapGesture = Gesture.Tap()
    .onStart((event) => {
      runOnJS(setScrollLocked)(true);
      runOnJS(pick)(event.x);
    })
    .onEnd(() => {
      runOnJS(endScrub)();
    });

  const combinedGesture = Gesture.Simultaneous(panGesture, tapGesture);

  if (series.length < 2) return null;

  const dot = geometry && active != null ? geometry.coords[active] : null;
  const activePoint = active != null ? series[active] : null;
  const gradientId = `wash-${color.replace("#", "")}`;

  // Clamped horizontal position for floating pill tooltip
  const pillWidth = 110;
  const pillLeft = dot ? Math.max(6, Math.min(width - pillWidth - 6, dot.x - pillWidth / 2)) : 0;

  return (
    <GestureDetector gesture={combinedGesture}>
      <View
        style={{ height, marginHorizontal: -18, marginTop: 4, position: "relative" }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        {geometry && width > 0 ? (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity="0.28" />
                <Stop offset="0.65" stopColor={color} stopOpacity="0.05" />
                <Stop offset="1" stopColor={color} stopOpacity="0" />
              </LinearGradient>
            </Defs>

            {/* Optional Baseline / Comparison trajectory */}

            {/* Reference horizontal guideline */}
            {geometry.refY != null ? (
              <Line
                x1={0}
                x2={width}
                y1={geometry.refY}
                y2={geometry.refY}
                stroke={colors.tertiary}
                strokeDasharray="3 5"
                strokeWidth={1}
                opacity={0.8}
              />
            ) : null}

            <ClipPath id={clipId}>
              <Rect ref={clipRef} x={0} y={0} width={tipOn || reduceMotion ? width : 0} height={height} />
            </ClipPath>

            <G clipPath={`url(#${clipId})`}>
              {/* Gradient wash reveals with the stroke */}
              <Path d={geometry.area} fill={`url(#${gradientId})`} opacity={0.9} />

              {/* Main fluid spend curve */}
              <Path
                ref={lineRef}
                d={geometry.line}
                stroke={color}
                strokeWidth={2.75}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={geometry.length}
                strokeDashoffset={tipOn || reduceMotion ? 0 : geometry.length}
              />
            </G>

            {/* Interactive Vertical Crosshair when scrubbing */}
            {active != null && dot ? (
              <Line
                x1={dot.x}
                x2={dot.x}
                y1={10}
                y2={height - 4}
                stroke={colors.ink}
                strokeOpacity={0.25}
                strokeWidth={1.25}
                strokeDasharray="2 3"
              />
            ) : null}

            {/* Scrubber Point on curve when actively scrubbing */}
            {active != null && dot ? (
              <>
                <Circle cx={dot.x} cy={dot.y} r={9} fill={color} fillOpacity={0.25} />
                <Circle cx={dot.x} cy={dot.y} r={6} fill={color} />
                <Circle cx={dot.x} cy={dot.y} r={2.5} fill={colors.card} />
              </>
            ) : null}

            {/* Endpoint rests after one breath, once the line has finished */}
            {active == null && tipOn && geometry.coords.length > 0 ? (
              <G ref={tipRef} opacity={1}>
                <Circle
                  cx={geometry.coords[geometry.coords.length - 1].x}
                  cy={geometry.coords[geometry.coords.length - 1].y}
                  r={8}
                  fill={color}
                  fillOpacity={0.22}
                />
                <Circle
                  cx={geometry.coords[geometry.coords.length - 1].x}
                  cy={geometry.coords[geometry.coords.length - 1].y}
                  r={4.5}
                  fill={color}
                />
                <Circle
                  cx={geometry.coords[geometry.coords.length - 1].x}
                  cy={geometry.coords[geometry.coords.length - 1].y}
                  r={1.8}
                  fill={colors.card}
                />
              </G>
            ) : null}
          </Svg>
        ) : null}

        {/* Scrub Tooltip Pill */}
        {activePoint && dot && width > 0 ? (
          <View
            pointerEvents="none"
            style={[
              styles.floatingPill,
              {
                left: pillLeft,
                top: Math.max(4, Math.min(height - 44, dot.y - 42)),
              },
            ]}
          >
            <Text style={styles.pillDate}>{shortDate(activePoint.date)}</Text>
            <Text style={styles.pillAmount}>{money(activePoint.cents)}</Text>
          </View>
        ) : null}

        {/* Reference label */}
        {reference && geometry?.refY != null && active == null ? (
          <Text
            pointerEvents="none"
            style={[styles.tagText, { top: geometry.refY - 8, left: 12 }]}
          >
            {reference.label}
          </Text>
        ) : null}

        {/* Caption */}
        {caption && active == null ? (
          <Text pointerEvents="none" style={[styles.tagText, { top: 4, right: 12 }]}>
            {caption}
          </Text>
        ) : null}
      </View>
    </GestureDetector>
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

const useStyles = themedStyles((colors) =>
  StyleSheet.create({
  floatingPill: {
    position: "absolute",
    width: 110,
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingVertical: 5,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.lineStrong,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
    zIndex: 10,
  },
  pillDate: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  pillAmount: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.2,
    marginTop: 1,
  },
  tagText: {
    position: "absolute",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.tertiary,
    textTransform: "uppercase",
  },
  }),
);
