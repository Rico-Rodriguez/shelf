export function EmptyState({
  title,
  children,
  action,
}: {
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      {title ? <p className="empty-title">{title}</p> : null}
      {children ? <p className="empty-body">{children}</p> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}
