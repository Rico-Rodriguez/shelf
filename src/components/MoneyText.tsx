import { formatMoney } from "@/lib/money";

export function MoneyText({
  cents,
  signed = false,
  className = "",
  hero = false,
  figure = false,
}: {
  cents: number;
  signed?: boolean;
  className?: string;
  hero?: boolean;
  figure?: boolean;
}) {
  const value = signed ? formatMoney(Math.abs(cents)) : formatMoney(cents);
  const prefix = signed ? (cents > 0 ? "+" : cents < 0 ? "-" : "") : "";
  const tone = signed
    ? cents > 0
      ? "text-[var(--positive)]"
      : cents < 0
        ? "text-[var(--danger)]"
        : ""
    : "";
  return (
    <span className={`money ${hero ? "hero-number" : ""} ${figure ? "money-figure" : ""} ${tone} ${className}`}>
      {prefix}
      {value}
    </span>
  );
}
