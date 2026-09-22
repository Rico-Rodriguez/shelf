export function SpendMix({ rows }: { rows: { key: string; cents: number; color: string }[] }) {
  const shown = rows.filter((row) => row.cents > 0);
  if (shown.length < 2) return null;
  return (
    <div className="spend-mix" aria-hidden>
      {shown.map((row) => (
        <span key={row.key} style={{ flexGrow: row.cents, background: row.color }} />
      ))}
    </div>
  );
}
