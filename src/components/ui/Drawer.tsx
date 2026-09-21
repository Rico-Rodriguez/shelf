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
      <div className="ios-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="ios-sheet-handle" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-[20px] font-semibold tracking-[-0.03em]">{title}</h2>
          {action}
        </div>
        <div className="field-stack pb-2">{children}</div>
      </div>
    </div>
  );
}
