import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View, type View as ViewType } from "react-native";
import { shelfFont } from "./brand";

export type FlightRect = { x: number; y: number; width: number; height: number };

export type FlightPiece = {
  key: string;
  kind?: "text" | "fill";
  text?: string;
  meta?: string;
  toMeta?: string;
  metaColor?: string;
  color: string;
  toColor?: string;
  fontSize?: number;
  toFontSize?: number;
  fontWeight?: "500" | "600" | "700";
  from: FlightRect;
  to?: FlightRect;
  toAnchor?: string;
  delay?: number;
};

export type FlightPlan = {
  id: string;
  token?: number;
  pieces: FlightPiece[];
  hide?: string[];
  handoff?: "chart-to-bars" | "bars-to-chart";
  duration?: number;
  onDone?: () => void;
};

type AnchorRecord = { rect: FlightRect };
type Memory = { text: string; color: string; fontSize: number };

const anchors = new Map<string, AnchorRecord>();
const memory = new Map<string, Memory>();
const listeners = new Set<() => void>();
const refreshers = new Set<() => void>();

let hiddenIds = new Set<string>();
let active: FlightPlan | null = null;
let staged: FlightPlan | null = null;
let token = 0;
let surface: "today" | "plan" | "activity" | "other" = "other";
let categoryReturn: { anchor: string; rect: FlightRect } | null = null;
let goalAdjust: { id: string; remainingCents: number; addedCents: number } | null = null;

export const barsOpacity = new Animated.Value(1);
export const chartOpacity = new Animated.Value(1);

function emit() {
  for (const listener of listeners) listener();
}

export function registerAnchor(id: string, rect: FlightRect) {
  if (rect.width <= 0 || rect.height <= 0) return;
  const prev = anchors.get(id);
  if (
    prev &&
    Math.abs(prev.rect.x - rect.x) < 0.5 &&
    Math.abs(prev.rect.y - rect.y) < 0.5 &&
    Math.abs(prev.rect.width - rect.width) < 0.5 &&
    Math.abs(prev.rect.height - rect.height) < 0.5
  ) {
    return;
  }
  anchors.set(id, { rect });
  emit();
}

export function anchorRect(id: string): FlightRect | null {
  return anchors.get(id)?.rect ?? null;
}

export function rememberAnchor(id: string, payload: Memory) {
  memory.set(id, payload);
}

export function recallAnchor(id: string): Memory | null {
  return memory.get(id) ?? null;
}

export function measureView(node: ViewType | null): Promise<FlightRect | null> {
  return new Promise((resolve) => {
    if (!node) {
      resolve(null);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      if (width <= 0 || height <= 0) resolve(null);
      else resolve({ x, y, width, height });
    });
  });
}

export function useMeasuredAnchor(
  id: string | null | undefined,
  payload?: { text: string; color: string; fontSize: number } | null,
) {
  const ref = useRef<View>(null);
  const text = payload?.text;
  const color = payload?.color;
  const fontSize = payload?.fontSize;
  const onLayout = useCallback(() => {
    requestAnimationFrame(() => {
      ref.current?.measureInWindow((x, y, width, height) => {
        if (!id || width <= 0 || height <= 0) return;
        registerAnchor(id, { x, y, width, height });
        if (text != null && color != null && fontSize != null) rememberAnchor(id, { text, color, fontSize });
      });
    });
  }, [id, text, color, fontSize]);
  return { ref, onLayout, collapsable: false as const };
}

export function useFlightHidden(id: string | null | undefined): number {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const sync = () => setHidden(Boolean(id && hiddenIds.has(id)));
    sync();
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, [id]);
  return hidden ? 0 : 1;
}

export function useFlightClock(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const sync = () => setN((value) => value + 1);
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);
  return n;
}

export function onShelfRefresh(listener: () => void) {
  refreshers.add(listener);
  return () => {
    refreshers.delete(listener);
  };
}

export function emitShelfRefresh() {
  for (const listener of refreshers) listener();
}

export function setFlightSurface(next: "today" | "plan" | "activity" | "other") {
  surface = next;
}

export function flightSurface() {
  return surface;
}

export function setCategoryReturn(anchor: string, rect: FlightRect) {
  categoryReturn = { anchor, rect };
}

export function takeCategoryReturn() {
  const current = categoryReturn;
  categoryReturn = null;
  return current;
}

export function peekCategoryReturn() {
  return categoryReturn;
}

export function goalPreview() {
  return goalAdjust;
}

export function previewGoalRemaining(id: string, remainingCents: number, addedCents: number) {
  goalAdjust = { id, remainingCents, addedCents };
  emit();
}

export function clearGoalPreview() {
  if (!goalAdjust) return;
  goalAdjust = null;
  emit();
}

export function stageFlight(plan: FlightPlan, reduceMotion = false) {
  staged = plan;
  if (reduceMotion) return;
  if (plan.handoff === "chart-to-bars") barsOpacity.setValue(0);
  if (plan.handoff === "bars-to-chart") chartOpacity.setValue(0);
}

export function takeFlight(id: string): FlightPlan | null {
  if (staged?.id !== id) return null;
  const plan = staged;
  staged = null;
  return plan;
}

function release(plan: FlightPlan) {
  if (active?.token !== plan.token) return;
  active = null;
  hiddenIds = new Set();
  barsOpacity.setValue(1);
  chartOpacity.setValue(1);
  emit();
  plan.onDone?.();
}

export function playFlight(plan: FlightPlan, reduceMotion: boolean) {
  if (reduceMotion) {
    barsOpacity.setValue(1);
    chartOpacity.setValue(1);
    hiddenIds = new Set();
    plan.onDone?.();
    emit();
    return;
  }
  if (active) {
    const previous = active;
    active = null;
    hiddenIds = new Set();
    previous.onDone?.();
  }
  const next = { ...plan, token: ++token, duration: plan.duration ?? 560 };
  active = next;
  hiddenIds = new Set(plan.hide ?? []);
  if (plan.handoff === "chart-to-bars") {
    barsOpacity.setValue(0);
    Animated.timing(barsOpacity, {
      toValue: 1,
      duration: next.duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }
  if (plan.handoff === "bars-to-chart") {
    chartOpacity.setValue(0);
    Animated.timing(chartOpacity, {
      toValue: 1,
      duration: next.duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }
  emit();
}

export function useFlightArrival(id: string, reduceMotion: boolean, prepare?: (plan: FlightPlan) => void) {
  const prepareRef = useRef(prepare);
  prepareRef.current = prepare;
  useFocusEffect(
    useCallback(() => {
      const plan = takeFlight(id);
      if (!plan) return;
      prepareRef.current?.(plan);
      playFlight(plan, reduceMotion);
    }, [id, reduceMotion]),
  );
}

export function launchLeftToPlan(reduceMotion: boolean) {
  const from = anchorRect("today.left");
  const mem = recallAnchor("today.left");
  if (!from || !mem) return false;
  stageFlight(
    {
      id: "left-to-plan",
      handoff: "chart-to-bars",
      hide: ["today.left", "plan.left"],
      pieces: [
        {
          key: "left",
          text: mem.text,
          color: mem.color,
          fontSize: mem.fontSize,
          fontWeight: "700",
          from,
          toAnchor: "plan.left",
          toFontSize: 38,
        },
      ],
    },
    reduceMotion,
  );
  return true;
}

export function launchPlanToToday(reduceMotion: boolean) {
  const from = anchorRect("plan.left");
  const mem = recallAnchor("plan.left");
  if (!from || !mem) return false;
  stageFlight(
    {
      id: "plan-to-left",
      handoff: "bars-to-chart",
      hide: ["plan.left", "today.left"],
      pieces: [
        {
          key: "left",
          text: mem.text,
          color: mem.color,
          fontSize: mem.fontSize,
          fontWeight: "700",
          from,
          toAnchor: "today.left",
          toFontSize: 46,
        },
      ],
    },
    reduceMotion,
  );
  return true;
}

function resolvePieces(pieces: FlightPiece[], elapsed: number): { ready: FlightPiece[]; waiting: boolean } {
  let waiting = false;
  const ready = pieces.map((piece) => {
    if (piece.to) return piece;
    const rect = piece.toAnchor ? anchorRect(piece.toAnchor) : null;
    if (rect) return { ...piece, to: rect };
    if (piece.toAnchor && elapsed < 900) waiting = true;
    return piece;
  });
  return { ready: ready.filter((piece) => piece.to), waiting };
}

export function FlightRun({ plan, onDone }: { plan: FlightPlan; onDone: () => void }) {
  const [run, setRun] = useState<{ pieces: FlightPiece[]; values: Animated.Value[] } | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const signature = `${plan.id}:${plan.pieces.map((piece) => `${piece.key}:${piece.from.x}:${piece.from.y}:${piece.to?.x ?? ""}:${piece.toAnchor ?? ""}`).join("|")}`;
  useEffect(() => {
    let cancelled = false;
    const started = Date.now();
    const tick = () => {
      if (cancelled) return;
      const elapsed = Date.now() - started;
      const next = resolvePieces(plan.pieces, elapsed);
      if (next.waiting) {
        requestAnimationFrame(tick);
        return;
      }
      setRun({ pieces: next.ready, values: next.ready.map(() => new Animated.Value(0)) });
    };
    tick();
    return () => {
      cancelled = true;
    };
    // The signature already includes the piece geometry. Depending on `plan` restarts the flight every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(() => {
    if (!run) return;
    if (!run.pieces.length) {
      onDoneRef.current();
      return;
    }
    const duration = plan.duration ?? 560;
    Animated.parallel(
      run.pieces.map((piece, index) =>
        Animated.timing(run.values[index], {
          toValue: 1,
          duration,
          delay: piece.delay ?? 0,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ),
    ).start(({ finished }) => {
      if (finished) onDoneRef.current();
    });
  }, [run, plan.duration]);

  if (!run?.pieces.length) return null;
  return (
    <>
      {run.pieces.map((piece, index) => (
        <FlightGlyph key={piece.key} piece={piece} progress={run.values[index]} />
      ))}
    </>
  );
}

function FlightGlyph({ piece, progress }: { piece: FlightPiece; progress: Animated.Value }) {
  const from = piece.from;
  const to = piece.to ?? piece.from;
  const font = piece.fontSize ?? 16;
  const toFont = piece.toFontSize ?? font;
  const fcx = from.x + from.width / 2;
  const fcy = from.y + from.height / 2;
  const tcx = to.x + to.width / 2;
  const tcy = to.y + to.height / 2;
  const scaleX = piece.kind === "fill" ? to.width / Math.max(from.width, 1) : toFont / font;
  const scaleY = piece.kind === "fill" ? to.height / Math.max(from.height, 1) : toFont / font;
  const weight = piece.fontWeight ?? "600";
  const face = shelfFont({ fontWeight: weight });
  const motion = {
    transform: [
      { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, tcx - fcx] }) },
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, tcy - fcy] }) },
      { scaleX: progress.interpolate({ inputRange: [0, 1], outputRange: [1, scaleX] }) },
      { scaleY: progress.interpolate({ inputRange: [0, 1], outputRange: [1, scaleY] }) },
    ],
  };
  if (piece.kind === "fill") {
    return (
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            left: from.x,
            top: from.y,
            width: from.width,
            height: from.height,
            backgroundColor: piece.color,
            borderRadius: Math.min(from.height, 12),
          },
          motion,
        ]}
      />
    );
  }
  const fadeOut = progress.interpolate({ inputRange: [0, 0.45, 1], outputRange: [1, 0, 0] });
  const fadeIn = progress.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, 1, 1] });
  const textStyle = {
    fontFamily: face,
    fontSize: font,
    fontWeight: weight,
    letterSpacing: font >= 32 ? -1.2 : -0.2,
    fontVariant: ["tabular-nums" as const],
  };
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", left: from.x, top: from.y, width: Math.max(from.width, 40), minHeight: from.height }, motion]}
    >
      <Animated.Text style={[textStyle, { color: piece.color, opacity: piece.toColor && piece.toColor !== piece.color ? fadeOut : 1 }]} numberOfLines={1}>
        {piece.text}
      </Animated.Text>
      {piece.toColor && piece.toColor !== piece.color ? (
        <Animated.Text style={[textStyle, { color: piece.toColor, opacity: fadeIn, position: "absolute", left: 0, top: 0 }]} numberOfLines={1}>
          {piece.text}
        </Animated.Text>
      ) : null}
      {piece.meta ? (
        <Animated.Text style={{ marginTop: 2, fontSize: 12, color: piece.metaColor ?? piece.color, fontFamily: shelfFont({ fontWeight: "500" }), opacity: piece.toMeta ? fadeOut : 1 }} numberOfLines={1}>
          {piece.meta}
        </Animated.Text>
      ) : null}
      {piece.toMeta ? (
        <Animated.Text style={{ marginTop: 2, fontSize: 12, color: piece.metaColor ?? piece.color, fontFamily: shelfFont({ fontWeight: "500" }), opacity: fadeIn, position: "absolute", left: 0, top: font + 2 }} numberOfLines={1}>
          {piece.toMeta}
        </Animated.Text>
      ) : null}
    </Animated.View>
  );
}

export function FlightHost() {
  const revision = useFlightClock();
  const plan = active;
  if (!plan) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 4000, elevation: 4000 }]}>
      <FlightRun key={`${plan.token ?? revision}`} plan={plan} onDone={() => release(plan)} />
    </View>
  );
}

export function sameFlightText(carried: string | undefined, real: string) {
  return !carried || carried === real;
}
