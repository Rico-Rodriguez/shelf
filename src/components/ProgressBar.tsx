export function ProgressBar({
  value,
  max,
  color = "var(--positive)",
}: {
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max <= 0 ? (value > 0 ? 100 : 0) : Math.min(100, Math.round((value / max) * 100));
  const over = max > 0 ? value > max : value > 0;
  return (
    <div className="progress-track" aria-hidden>
      <div className="progress-fill" style={{ width: `${pct}%`, background: over ? "var(--danger)" : color }} />
    </div>
  );
}
