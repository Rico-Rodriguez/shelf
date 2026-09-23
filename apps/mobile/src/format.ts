export function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function signed(cents: number): string {
  if (cents > 0) return `+${money(cents)}`;
  if (cents < 0) return `-${money(Math.abs(cents))}`;
  return money(0);
}

export function outflow(cents: number): string {
  return signed(-cents);
}

export function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const date = new Date(year, month - 1 + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}
