export type HapticKind = "light" | "ok" | "tick";

const PATTERN: Record<HapticKind, number | number[]> = {
  light: 12,
  ok: [10, 28, 16],
  tick: 8,
};

export function haptic(kind: HapticKind = "light") {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  try {
    navigator.vibrate(PATTERN[kind]);
  } catch {
    /* some browsers reject vibrate outside a gesture */
  }
}
