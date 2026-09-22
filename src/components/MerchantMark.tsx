"use client";

const PALETTE = ["#1b7a62", "#2f5d8c", "#8a5a2b", "#6b4f9a", "#b04a3a", "#3d6b5a", "#4a5568"];

function hash(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function MerchantMark({ name, color }: { name: string; color?: string | null }) {
  const label = (name || "?").trim();
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  const bg = color || PALETTE[hash(label) % PALETTE.length];
  return (
    <span className="merchant-mark" style={{ background: `${bg}22`, color: bg }} aria-hidden>
      {initials || "?"}
    </span>
  );
}
