const LEGACY: Record<string, string> = {
  "#6b8f5e": "#30D158",
  "#c4a484": "#A2845E",
  "#e07a5f": "#FF453A",
  "#4a6fa5": "#0A84FF",
  "#d4847c": "#FF375F",
  "#e0a84a": "#FF9F0A",
  "#7ba3a0": "#64D2FF",
  "#8b6b9a": "#BF5AF2",
  "#8b7355": "#8E8E93",
  "#9a8b7a": "#98989D",
};

export function shelfColor(hex: string | null | undefined) {
  if (!hex) return "#8E8E93";
  return LEGACY[hex.trim().toLowerCase()] ?? hex;
}
