export function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function flowMoney(cents: number): { text: string; color: string } {
  if (cents < 0) return { text: `+${money(Math.abs(cents))}`, color: "#1b7a62" };
  return { text: money(cents), color: "#14181f" };
}

export function shelfColor(hex: string | null | undefined): string {
  const legacy: Record<string, string> = {
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
  };
  if (!hex) return "#5C6570";
  return legacy[hex.trim().toLowerCase()] ?? hex;
}

export function signed(cents: number): string {
  if (cents > 0) return `+${money(cents)}`;
  if (cents < 0) return `-${money(Math.abs(cents))}`;
  return money(0);
}

export function outflow(cents: number): string {
  return signed(-cents);
}

export function todayISO(): string {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function dayLabel(iso: string): string {
  const today = todayISO();
  if (iso === today) return "Today";
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yMonth = String(yesterday.getMonth() + 1).padStart(2, "0");
  const yDay = String(yesterday.getDate()).padStart(2, "0");
  if (iso === `${yesterday.getFullYear()}-${yMonth}-${yDay}`) return "Yesterday";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

export function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function inDaysPhrase(iso: string): string {
  const today = new Date(`${todayISO()}T12:00:00`).getTime();
  const then = new Date(`${iso}T12:00:00`).getTime();
  const days = Math.round((then - today) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

export function categorizeLabel(count: number): string {
  if (count === 1) return "1 purchase to categorize";
  return `${count > 99 ? "99+" : count} purchases to categorize`;
}

export function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const date = new Date(year, month - 1 + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function monthRange(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { start, end };
}

export function isLiability(type: string): boolean {
  return type === "credit" || type === "loan";
}
