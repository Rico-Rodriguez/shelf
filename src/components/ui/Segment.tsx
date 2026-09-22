export function Segment({
  value,
  options,
  onChange,
  className = "",
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  className?: string;
}) {
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  return (
    <div
      className={`ios-seg ${className}`.trim()}
      role="tablist"
      style={{ ["--seg-count" as string]: options.length, ["--seg-index" as string]: index }}
    >
      <span className="ios-seg-thumb" aria-hidden />
      {options.map((option) => (
        <button key={option.value} type="button" role="tab" aria-selected={value === option.value} className={value === option.value ? "active" : ""} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
