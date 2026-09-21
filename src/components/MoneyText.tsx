import { formatMoney } from "@/lib/money";

export function MoneyText({
  cents,
  signed = false,
  className = "",
}: {
  cents: number;
  signed?: boolean;
  className?: string;
}) {
  const value = signed ? formatMoney(Math.abs(cents)) : formatMoney(cents);
  const prefix = signed ? (cents > 0 ? "+" : cents < 0 ? "-" : "") : "";
  const tone = signed
    ? cents > 0
      ? "text-[var(--sage)]"
      : cents < 0
        ? "text-[var(--danger)]"
        : ""
    : "";
  return (
    <span className={`tabular-nums ${tone} ${className}`}>
      {prefix}
      {value}
    </span>
  );
}
