import { MoneyText } from "../MoneyText";

export function Stat({
  label,
  cents,
  signed = false,
}: {
  label: string;
  cents: number;
  signed?: boolean;
}) {
  return (
    <div className="min-w-0 px-4 py-3">
      <div className="text-[13px] leading-[18px] text-[var(--muted)]">{label}</div>
      <div className="mt-0.5 truncate text-[28px] font-semibold leading-8 tracking-[-0.03em] tabular-nums">
        <MoneyText cents={cents} signed={signed} />
      </div>
    </div>
  );
}
