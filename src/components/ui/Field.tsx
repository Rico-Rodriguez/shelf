export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`field ${className}`.trim()}>
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function FieldStack({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`field-stack ${className}`.trim()}>{children}</div>;
}
