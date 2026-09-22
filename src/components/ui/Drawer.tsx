"use client";

import { useEffect, useRef } from "react";

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
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const dragY = useRef(0);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function onTouchStart(event: React.TouchEvent) {
    startY.current = event.touches[0]?.clientY ?? null;
    dragY.current = 0;
  }

  function onTouchMove(event: React.TouchEvent) {
    if (startY.current == null || !sheetRef.current) return;
    const y = event.touches[0]?.clientY ?? startY.current;
    const delta = Math.max(0, y - startY.current);
    dragY.current = delta;
    sheetRef.current.style.transform = `translateY(${delta}px)`;
    sheetRef.current.style.transition = "none";
  }

  function onTouchEnd() {
    if (!sheetRef.current) return;
    sheetRef.current.style.transition = "";
    if (dragY.current > 120) {
      onClose();
      return;
    }
    sheetRef.current.style.transform = "";
    startY.current = null;
    dragY.current = 0;
  }

  return (
    <div className="ios-sheet-backdrop" onClick={onClose}>
      <div
        ref={sheetRef}
        className="ios-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="ios-sheet-handle" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-[20px] font-semibold tracking-[-0.03em]">{title}</h2>
          <button type="button" className="text-[15px] font-semibold text-[var(--muted)]" onClick={onClose} aria-label="Close">
            Done
          </button>
        </div>
        {action ? <div className="mb-3">{action}</div> : null}
        <div className="field-stack pb-[max(12px,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}
