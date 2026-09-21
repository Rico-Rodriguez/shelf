export function Hint({
  title,
  children,
  tone = "neutral",
}: {
  title?: string;
  children: React.ReactNode;
  tone?: "neutral" | "action" | "success";
}) {
  return (
    <aside className={`hint hint-${tone}`} role="note">
      {title ? <div className="hint-title">{title}</div> : null}
      <div className="hint-body">{children}</div>
    </aside>
  );
}
