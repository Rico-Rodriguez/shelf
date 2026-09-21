"use client";

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="ios-sheet-backdrop" onClick={onClose}>
      <div
        className="ios-sheet space-y-3"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ios-sheet-handle" />
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        {children}
      </div>
    </div>
  );
}
