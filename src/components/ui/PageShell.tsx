function Bone({ className }: { className: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function PageSkeleton({
  title,
  rows = 4,
  variant = "list",
}: {
  title?: string;
  rows?: number;
  variant?: "home" | "plan" | "activity" | "accounts" | "list";
}) {
  const hero = <Bone className="h-44 w-full rounded-[22px]" />;
  const list = (
    <div className="card overflow-hidden">
      {Array.from({ length: variant === "home" ? 4 : rows }).map((_, index) => (
        <div key={index} className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3.5 last:border-0">
          <Bone className="h-4 w-28 rounded-md" />
          <Bone className="h-4 w-16 rounded-md" />
        </div>
      ))}
    </div>
  );

  if (variant === "home") {
    return (
      <div className="page-shell space-y-6" aria-busy="true" aria-live="polite">
        <div className="card space-y-4 p-5">
          <Bone className="h-4 w-28 rounded-md" />
          <Bone className="h-12 w-44 rounded-lg" />
          <Bone className="h-28 w-full rounded-xl" />
          <div className="grid grid-cols-3 gap-3 border-t border-[var(--line)] pt-3">
            <Bone className="h-8 rounded-md" />
            <Bone className="h-8 rounded-md" />
            <Bone className="h-8 rounded-md" />
          </div>
        </div>
        {list}
      </div>
    );
  }

  if (variant === "activity") {
    return (
      <div className="page-shell space-y-4" aria-busy="true" aria-live="polite">
        <Bone className="h-8 w-28 rounded-lg" />
        <Bone className="h-24 w-full rounded-[22px]" />
        <Bone className="h-11 w-full rounded-xl" />
        {list}
      </div>
    );
  }

  if (variant === "plan" || variant === "accounts") {
    return (
      <div className="page-shell space-y-4" aria-busy="true" aria-live="polite">
        <Bone className="h-8 w-24 rounded-lg" />
        {hero}
        {list}
      </div>
    );
  }

  return (
    <div className="page-shell space-y-4" aria-busy="true" aria-live="polite">
      <Bone className={`h-9 rounded-lg ${title ? "w-40" : "w-36"}`} />
      {hero}
      {Array.from({ length: rows }).map((_, index) => (
        <Bone key={index} className="h-16 w-full rounded-[14px]" />
      ))}
    </div>
  );
}

export function PageError({
  title,
  message,
  onRetry,
}: {
  title?: string;
  message?: string | null;
  onRetry?: () => void;
}) {
  const detail = message && message !== "Could not load" ? message : "Check the connection and try again.";
  return (
    <div className="page-shell">
      {title ? <h1 className="mb-4">{title}</h1> : null}
      <div className="empty-state">
        <p className="empty-title">Couldn’t load this</p>
        <p className="empty-body">{detail}</p>
        {onRetry ? (
          <div className="empty-action">
            <button className="shelf-btn" type="button" onClick={onRetry}>
              Try again
            </button>
          </div>
        ) : null}
      </div>
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
  return (
    <div className="page-shell">
      <div className={`refresh-bar${refreshing ? " is-on" : ""}`} aria-hidden />
      {children}
    </div>
  );
}
