import { MoneyText } from "./MoneyText";

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
      <div className="mt-0.5 truncate text-[22px] font-bold leading-7 tracking-[-0.26px]">
        <MoneyText cents={cents} signed={signed} />
      </div>
    </div>
  );
}
