"use client";

export function Drawer({
  title,
  onClose,
  children,
  action,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="ios-sheet-backdrop" onClick={onClose}>
      <div className="ios-sheet space-y-3" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="ios-sheet-handle" />
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[18px] font-semibold tracking-tight">{title}</h2>
          {action}
        </div>
        {children}
      </div>
    </div>
  );
}
