"use client";

import NumberFlow from "@number-flow/react";
import { formatMoney } from "@/lib/money";

const SPRING = { duration: 520, easing: "cubic-bezier(0.22, 1, 0.36, 1)" };
const INSTANT = { duration: 0 };

export function MoneyText({
  cents,
  signed = false,
  flow = false,
  className = "",
  hero = false,
  figure = false,
  animate = false,
  live = false,
}: {
  cents: number;
  signed?: boolean;
  /** Positive cents are money out (neutral). Negative cents are money in (green). */
  flow?: boolean;
  className?: string;
  hero?: boolean;
  figure?: boolean;
  /** Roll the digits when the value changes. */
  animate?: boolean;
  /** Track the value immediately, as while a finger is on a chart. */
  live?: boolean;
}) {
  const inbound = flow && cents < 0;
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
  const classes = `money ${hero ? "hero-number" : ""} ${figure ? "money-figure" : ""} ${tone} ${className}`.trim();

  if (animate) {
    const value = flow ? Math.abs(cents) / 100 : signed ? cents / 100 : cents / 100;
    const prefix = flow ? (inbound ? "+" : "") : signed && cents > 0 ? "+" : "";
    return (
      <NumberFlow
        className={classes}
        value={value}
        locales="en-US"
        format={{ style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }}
        prefix={prefix}
        animated={!live}
        respectMotionPreference
        transformTiming={live ? INSTANT : SPRING}
        spinTiming={live ? INSTANT : SPRING}
        opacityTiming={live ? INSTANT : { duration: 280, easing: "ease-out" }}
      />
    );
  }

  const text = signed || flow ? formatMoney(Math.abs(cents)) : formatMoney(cents);
  const prefix = flow ? (inbound ? "+" : "") : signed ? (cents > 0 ? "+" : cents < 0 ? "-" : "") : "";
  return (
    <span className={classes}>
      {prefix}
      {text}
    </span>
  );
}
