export function ProgressBar({
  value,
  max,
  color = "var(--sage)",
}: {
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max <= 0 ? (value > 0 ? 100 : 0) : Math.min(100, Math.round((value / max) * 100));
  const over = max > 0 && value > max;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[rgba(120,120,128,0.16)]">
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${pct}%`, background: over ? "var(--danger)" : color }}
      />
    </div>
  );
}
