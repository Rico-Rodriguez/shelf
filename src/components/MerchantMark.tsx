"use client";

export function MerchantMark({ name, color }: { name: string; color?: string | null }) {
  const label = (name || "?").trim();
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      className="merchant-mark"
      style={color ? { background: `${color}22`, color } : undefined}
      aria-hidden
    >
      {initials || "?"}
    </span>
  );
}
