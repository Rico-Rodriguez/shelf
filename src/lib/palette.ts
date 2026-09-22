const LEGACY: Record<string, string> = {
  "#6b8f5e": "#1B7A62",
  "#c4a484": "#8A5A2B",
  "#e07a5f": "#D94A2E",
  "#4a6fa5": "#2F5D8C",
  "#d4847c": "#B04A3A",
  "#e0a84a": "#C47A1A",
  "#7ba3a0": "#3D6B5A",
  "#8b6b9a": "#6B4F9A",
  "#8b7355": "#5C6570",
  "#9a8b7a": "#8B939E",
  "#00c805": "#1B7A62",
  "#30d158": "#1B7A62",
};

export function shelfColor(hex: string | null | undefined) {
  if (!hex) return "#5C6570";
  return LEGACY[hex.trim().toLowerCase()] ?? hex;
}

export function categoryDot(hex: string | null | undefined) {
  return shelfColor(hex);
}
