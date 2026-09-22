import { formatMoney } from "@/lib/money";

export function MoneyText({
  cents,
  signed = false,
  flow = false,
  className = "",
  hero = false,
  figure = false,
}: {
  cents: number;
  signed?: boolean;
  /** Positive cents are money out (neutral). Negative cents are money in (green). */
  flow?: boolean;
  className?: string;
  hero?: boolean;
  figure?: boolean;
}) {
  const inbound = flow && cents < 0;
  const value = signed || flow ? formatMoney(Math.abs(cents)) : formatMoney(cents);
  const prefix = flow ? (inbound ? "+" : "") : signed ? (cents > 0 ? "+" : cents < 0 ? "-" : "") : "";
  const tone = flow
    ? inbound
      ? "text-[var(--positive)]"
      : ""
    : signed
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
