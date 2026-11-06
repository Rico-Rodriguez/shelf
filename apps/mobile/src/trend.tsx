import { useEffect, useId, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import Svg, { Circle, ClipPath, Defs, G, Line, LinearGradient, Path, Polyline, Rect, Stop, type GProps } from "react-native-svg";
import { tapTick } from "./haptic";
import { useScrollLock } from "./scroll";
import { colors, useReduceMotion } from "./theme";

/** A point on a cumulative spending line. `at` runs 0 to 1 across the period. */
export type TrendPoint = { at: number; cents: number; label: string };

/**
 * The Home chart: this period's running total as a solid line, the last
 * period's as a dotted line, both on one dollar axis. Drag to read any day.
 */
export function TrendChart({
  points,
  compare,
  color = colors.accent,
  height = 168,
  onScrub,
}: {
  points: TrendPoint[];
  compare?: { at: number; cents: number }[];
  color?: string;
  height?: number;
  onScrub?: (point: TrendPoint | null) => void;
}) {
  const reduceMotion = useReduceMotion();
  const setScrollLocked = useScrollLock();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [drawn, setDrawn] = useState(false);
  const tipRef = useRef<G<GProps>>(null);
  const lastIndex = useRef<number | null>(null);
  const clipId = `trend-${useId().replace(/:/g, "")}`;
  const washId = `${clipId}-wash`;
  const signature = points.map((point) => `${point.at}:${point.cents}`).join(",");

  const geometry = useMemo(() => {
    if (points.length < 2 || width <= 0) return null;
    const top = Math.max(1, ...points.map((point) => point.cents), ...(compare ?? []).map((point) => point.cents));
    const padTop = 14;
    const padBottom = 10;
    const x = (at: number) => Math.min(1, Math.max(0, at)) * (width - 10);
    const y = (cents: number) => padTop + (1 - cents / (top * 1.06)) * (height - padTop - padBottom);
    const coords = points.map((point) => ({ x: x(point.at), y: y(point.cents) }));
    const line = coords.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
    const last = coords[coords.length - 1];
    const area = `${line} L ${last.x.toFixed(1)} ${height} L ${coords[0].x.toFixed(1)} ${height} Z`;
    const ghost = (compare ?? []).map((point) => `${x(point.at).toFixed(1)},${y(point.cents).toFixed(1)}`).join(" ");
    return { coords, line, area, ghost, last };
  }, [signature, compare, width, height]);

  // Draw in from the left once per new series.
  const [reveal, setReveal] = useState(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (!geometry) return;
    if (reduceMotion) {
      setReveal(1);
      setDrawn(true);
      return;
    }
    setDrawn(false);
    setReveal(0);
    let frame = 0;
    const started = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - started) / 720);
      setReveal(1 - Math.pow(1 - t, 3));
      if (t < 1) frame = requestAnimationFrame(tick);
      else setDrawn(true);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [signature, width, reduceMotion]);

  // The end dot breathes once after the line lands.
  useEffect(() => {
    if (!drawn || reduceMotion) return;
    let frame = 0;
    const started = Date.now();
    const step = () => {
      const t = Math.min(1, (Date.now() - started) / 900);
      tipRef.current?.setNativeProps?.({ opacity: 0.35 + 0.65 * Math.abs(Math.cos(t * Math.PI)) });
      if (t < 1) frame = requestAnimationFrame(step);
      else tipRef.current?.setNativeProps?.({ opacity: 1 });
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [drawn, reduceMotion]);

  useEffect(() => () => setScrollLocked(false), [setScrollLocked]);

  function pick(fingerX: number) {
    const coords = geometry?.coords;
    if (!coords?.length) return;
    let index = 0;
    for (let i = 0; i < coords.length; i++) {
      if (Math.abs(coords[i].x - fingerX) < Math.abs(coords[index].x - fingerX)) index = i;
    }
    if (lastIndex.current !== index) {
      lastIndex.current = index;
      tapTick();
    }
    setActive(index);
    onScrub?.(points[index] ?? null);
  }

  function release() {
    lastIndex.current = null;
    setActive(null);
    onScrub?.(null);
    setScrollLocked(false);
  }

  const pan = Gesture.Pan()
    .activeOffsetX([-3, 3])
    .failOffsetY([-14, 14])
    .onStart((event) => {
      runOnJS(setScrollLocked)(true);
      runOnJS(pick)(event.x);
    })
    .onUpdate((event) => {
      runOnJS(pick)(event.x);
    })
    .onFinalize(() => {
      runOnJS(release)();
    });
  const press = Gesture.LongPress()
    .minDuration(120)
    .onStart((event) => {
      runOnJS(setScrollLocked)(true);
      runOnJS(pick)(event.x);
    })
    .onFinalize(() => {
      runOnJS(release)();
    });
  const gesture = Gesture.Simultaneous(pan, press);

  const dot = geometry && active != null ? geometry.coords[active] : null;

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ height, marginHorizontal: -20 }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {geometry ? (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id={washId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity="0.16" />
                <Stop offset="1" stopColor={color} stopOpacity="0" />
              </LinearGradient>
              <ClipPath id={clipId}>
                <Rect x={0} y={0} width={drawn ? width : (geometry.last.x + 14) * reveal} height={height} />
              </ClipPath>
            </Defs>
            {geometry.ghost ? (
              <Polyline
                points={geometry.ghost}
                fill="none"
                stroke={colors.tertiary}
                strokeOpacity={0.6}
                strokeWidth={1.6}
                strokeDasharray="1.5 5"
                strokeLinecap="round"
              />
            ) : null}
            <G clipPath={`url(#${clipId})`}>
              <Path d={geometry.area} fill={`url(#${washId})`} />
              <Path d={geometry.line} stroke={color} strokeWidth={2.6} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            </G>
            {dot ? (
              <>
                <Line x1={dot.x} x2={dot.x} y1={0} y2={height} stroke={colors.tertiary} strokeOpacity={0.7} strokeWidth={1} />
                <Circle cx={dot.x} cy={dot.y} r={6} fill={color} stroke={colors.bg} strokeWidth={2.5} />
              </>
            ) : drawn ? (
              <G ref={tipRef}>
                <Circle cx={geometry.last.x} cy={geometry.last.y} r={12} fill={color} fillOpacity={0.14} />
                <Circle cx={geometry.last.x} cy={geometry.last.y} r={4.5} fill={color} />
              </G>
            ) : null}
          </Svg>
        ) : null}
      </View>
    </GestureDetector>
  );
}
