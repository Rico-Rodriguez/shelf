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
    <div className="min-w-0 border-b border-[var(--line)] px-4 py-3 sm:border-b-0 sm:border-r last:border-0">
      <div className="field-label">{label}</div>
      <div className="mt-1 truncate text-[24px] font-semibold leading-7 tracking-[-0.03em] tabular-nums">
        <MoneyText cents={cents} signed={signed} />
      </div>
    </div>
  );
}
