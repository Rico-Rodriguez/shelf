"use client";

import { useEffect, useRef, useState } from "react";

const WIDTH = 152;

export function SwipeRow({
  children,
  onCategory,
  onHide,
}: {
  children: React.ReactNode;
  onCategory: () => void;
  onHide: () => void;
}) {
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
      const next = Math.min(0, Math.max(-WIDTH, startOffset + dx));
      offsetRef.current = next;
      setOffset(next);
    }

    function onEnd() {
      if (axis !== "x") return;
      const next = offsetRef.current < -WIDTH / 2 ? -WIDTH : 0;
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
  }, []);

  return (
    <div className="swipe-row">
      <div className="swipe-actions">
        <button type="button" className="category" onClick={onCategory}>
          Category
        </button>
        <button type="button" className="hide" onClick={onHide}>
          Hide
        </button>
      </div>
      <div
        ref={rowRef}
        className="relative bg-[var(--paper)]"
        style={{ transform: `translate3d(${offset}px, 0, 0)`, transition: offset === 0 || offset === -WIDTH ? "transform 180ms ease" : "none" }}
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
