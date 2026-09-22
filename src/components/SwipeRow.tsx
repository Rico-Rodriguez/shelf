"use client";

import { useEffect, useRef, useState } from "react";

const BUTTON = 76;

export type SwipeAction = {
  label: string;
  tone: "ink" | "danger" | "accent";
  onClick: () => void;
};

export function SwipeRow({
  children,
  actions,
  peek = false,
}: {
  children: React.ReactNode;
  actions: SwipeAction[];
  peek?: boolean;
}) {
  const width = Math.max(BUTTON, actions.length * BUTTON);
  const rowRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const offsetRef = useRef(0);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    let startX = 0;
    let startY = 0;
    let startOffset = 0;
    let axis: "undecided" | "x" | "y" = "undecided";

    function onStart(event: TouchEvent) {
      const touch = event.touches[0];
      if (!touch) return;
      startX = touch.clientX;
      startY = touch.clientY;
      startOffset = offsetRef.current;
      axis = "undecided";
    }

    function onMove(event: TouchEvent) {
      const touch = event.touches[0];
      if (!touch) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (axis === "undecided") {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
      if (axis !== "x") return;
      if (event.cancelable) event.preventDefault();
      const next = Math.min(0, Math.max(-width, startOffset + dx));
      offsetRef.current = next;
      setOffset(next);
    }

    function onEnd() {
      if (axis !== "x") return;
      const next = offsetRef.current < -width / 2 ? -width : 0;
      offsetRef.current = next;
      setOffset(next);
    }

    row.addEventListener("touchstart", onStart, { passive: true });
    row.addEventListener("touchmove", onMove, { passive: false });
    row.addEventListener("touchend", onEnd);
    row.addEventListener("touchcancel", onEnd);
    return () => {
      row.removeEventListener("touchstart", onStart);
      row.removeEventListener("touchmove", onMove);
      row.removeEventListener("touchend", onEnd);
      row.removeEventListener("touchcancel", onEnd);
    };
  }, [width]);

  return (
    <div className={`swipe-row${peek ? " has-peek" : ""}`}>
      <div className="swipe-actions">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className={action.tone === "danger" ? "hide" : action.tone === "accent" ? "accent" : "category"}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        ))}
      </div>
      <div
        ref={rowRef}
        className="relative bg-[var(--paper)]"
        style={{ transform: `translate3d(${offset}px, 0, 0)`, transition: offset === 0 || offset === -width ? "transform 180ms ease" : "none" }}
        onClickCapture={(event) => {
          if (offset === 0) return;
          event.preventDefault();
          event.stopPropagation();
          offsetRef.current = 0;
          setOffset(0);
        }}
      >
        {children}
      </div>
    </div>
  );
}
