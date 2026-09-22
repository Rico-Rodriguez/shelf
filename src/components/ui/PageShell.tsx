export function PageSkeleton({ title, rows = 4 }: { title?: string; rows?: number }) {
  return (
    <div className="page-shell space-y-4" aria-busy="true" aria-live="polite">
      {title ? (
        <div>
          <div className="skeleton h-9 w-40 rounded-lg" />
          <div className="skeleton mt-2 h-4 w-64 max-w-full rounded-md" />
        </div>
      ) : (
        <div className="skeleton h-9 w-36 rounded-lg" />
      )}
      <div className="skeleton h-28 w-full rounded-[14px]" />
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="skeleton h-16 w-full rounded-[14px]" />
      ))}
    </div>
  );
}

export function PageShell({
  children,
  refreshing = false,
}: {
  children: React.ReactNode;
  refreshing?: boolean;
}) {
  return <div className={`page-shell ${refreshing ? "is-refreshing" : ""}`.trim()}>{children}</div>;
}
