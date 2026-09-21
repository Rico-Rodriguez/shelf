export function DataRow({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`data-row ${className}`.trim()}>{children}</div>;
}
