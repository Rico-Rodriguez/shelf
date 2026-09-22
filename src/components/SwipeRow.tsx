"use client";

import { useEffect, useRef } from "react";
import { animate } from "motion";
import { haptic } from "@/lib/haptic";

const BUTTON = 76;
const SPRING = { type: "spring" as const, stiffness: 520, damping: 36 };

export type SwipeAction = {
  label: string;
  tone: "ink" | "danger" | "accent";
  onClick: () => void;
};

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

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
  const offsetRef = useRef(0);
  const openRef = useRef(false);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    let startX = 0;
    let startY = 0;
    let startOffset = 0;
    let axis: "undecided" | "x" | "y" = "undecided";

    function setX(x: number, spring: boolean) {
      offsetRef.current = x;
      if (spring && !reducedMotion()) {
        void animate(row!, { transform: `translate3d(${x}px, 0, 0)` }, SPRING);
      } else {
        row!.style.transform = `translate3d(${x}px, 0, 0)`;
      }
    }

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
      const raw = startOffset + dx;
      const next = raw > 0 ? raw * 0.22 : raw < -width ? -width + (raw + width) * 0.22 : raw;
      setX(next, false);
    }

    function onEnd() {
      if (axis !== "x") return;
      const next = offsetRef.current < -width / 2 ? -width : 0;
      const wasOpen = openRef.current;
      openRef.current = next !== 0;
      setX(next, true);
      if (next !== 0 && !wasOpen) haptic("light");
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
        style={{ transform: "translate3d(0, 0, 0)" }}
        onClickCapture={(event) => {
          if (offsetRef.current === 0) return;
          event.preventDefault();
          event.stopPropagation();
          offsetRef.current = 0;
          openRef.current = false;
          const node = rowRef.current;
          if (!node) return;
          if (reducedMotion()) node.style.transform = "translate3d(0, 0, 0)";
          else void animate(node, { transform: "translate3d(0px, 0, 0)" }, SPRING);
        }}
      >
        {children}
      </div>
    </div>
  );
}
