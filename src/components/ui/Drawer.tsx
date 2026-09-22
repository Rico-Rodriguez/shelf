"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { animate } from "motion";

const SPRING = { type: "spring" as const, stiffness: 420, damping: 38 };

function translateY(node: HTMLElement) {
  const value = getComputedStyle(node).transform;
  if (!value || value === "none") return 0;
  return new DOMMatrix(value).m42;
}

function desktopSheet() {
  return window.matchMedia("(min-width: 768px)").matches;
}

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

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
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const requestCloseRef = useRef<(velocity?: number) => void>(() => onClose());
  const [shown, setShown] = useState(false);
  onCloseRef.current = onClose;

  useEffect(() => {
    const sheet = sheetRef.current;
    const scroller = scrollRef.current;
    const chrome = chromeRef.current;
    const backdrop = backdropRef.current;
    if (!sheet || !scroller || !chrome || !backdrop) return;

    const html = document.documentElement;
    const previousBody = document.body.style.overflow;
    const previousHtml = html.style.overflow;
    document.body.style.overflow = "hidden";
    html.style.overflow = "hidden";

    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setShown(true);
        if (desktopSheet() || reducedMotion()) return;
        void animate(sheet, { transform: "translate3d(0, 0px, 0)" }, SPRING);
      });
    });

    let closing = false;

    function setMotion(offset: number, animated: boolean) {
      if (desktopSheet()) return;
      const y = Math.max(0, offset);
      const height = sheet!.getBoundingClientRect().height || 1;
      const fade = Math.min(1, y / height);
      if (!animated || reducedMotion()) {
        sheet!.style.transform = `translate3d(0, ${y}px, 0)`;
        backdrop!.style.opacity = String(1 - fade);
        return;
      }
      void animate(sheet!, { transform: `translate3d(0, ${y}px, 0)` }, SPRING);
      void animate(backdrop!, { opacity: 1 - fade }, { duration: 0.22 });
    }

    function requestClose() {
      if (closing) return;
      closing = true;
      if (desktopSheet() || reducedMotion()) {
        onCloseRef.current();
        return;
      }
      const height = sheet!.getBoundingClientRect().height || 480;
      const motion = animate(sheet!, { transform: `translate3d(0, ${height + 48}px, 0)` }, SPRING);
      void animate(backdrop!, { opacity: 0 }, { duration: 0.2 });
      void motion.finished.then(() => onCloseRef.current());
    }

    requestCloseRef.current = () => requestClose();

    let tracking = false;
    let mode: "undecided" | "sheet" | "content" = "undecided";
    let fromChrome = false;
    let ownsGesture = false;
    let startY = 0;
    let lastY = 0;
    let lastT = 0;
    let velocity = 0;
    let offset = 0;
    let pointerId: number | null = null;
    let suppressClick = false;
    let seenStart = -1;
    let seenMove = -1;

    function syncTouchAction() {
      scroller!.style.touchAction = scroller!.scrollTop <= 0 ? "none" : "pan-y";
    }

    syncTouchAction();
    scroller.addEventListener("scroll", syncTouchAction, { passive: true });

    function reset() {
      tracking = false;
      mode = "undecided";
      fromChrome = false;
      ownsGesture = false;
      offset = 0;
      velocity = 0;
      pointerId = null;
    }

    function begin(clientY: number, chromeStart: boolean) {
      if (closing || desktopSheet()) return false;
      tracking = true;
      mode = "undecided";
      fromChrome = chromeStart;
      ownsGesture = chromeStart || scroller!.scrollTop <= 0;
      startY = lastY = clientY;
      lastT = performance.now();
      velocity = 0;
      offset = Math.max(0, translateY(sheet!));
      return true;
    }

    function claim(clientY: number, event?: { cancelable: boolean; preventDefault: () => void }) {
      if (event?.cancelable) event.preventDefault();
      if (pointerId != null) sheet!.setPointerCapture(pointerId);
      return clientY;
    }

    function move(clientY: number, event?: { cancelable: boolean; preventDefault: () => void }) {
      if (!tracking || closing) return;
      const now = performance.now();
      velocity = (clientY - lastY) / Math.max(1, now - lastT);
      lastY = clientY;
      lastT = now;
      const dy = clientY - startY;

      if (mode === "undecided") {
        if (Math.abs(dy) < 8) return;
        if (dy > 0 && (fromChrome || scroller!.scrollTop <= 0)) {
          mode = "sheet";
          const y = Math.max(0, translateY(sheet!));
          startY = claim(clientY, event) - y;
        } else if (ownsGesture && !fromChrome && dy < 0) {
          mode = "content";
          claim(clientY, event);
        } else {
          mode = "content";
          tracking = false;
          return;
        }
      }

      if (mode === "content") {
        if (event?.cancelable) event.preventDefault();
        const next = Math.max(0, -(clientY - startY));
        scroller!.scrollTop = next;
        if (next <= 0 && clientY > startY) {
          mode = "sheet";
          startY = clientY;
          offset = 0;
          setMotion(0, false);
        }
        return;
      }

      if (event?.cancelable) event.preventDefault();
      offset = Math.max(0, clientY - startY);
      if (offset === 0 && !fromChrome && clientY < startY) {
        mode = "content";
        startY = clientY;
        setMotion(0, false);
        return;
      }
      setMotion(offset, false);
    }

    function end() {
      const dragged = mode === "sheet";
      const endOffset = offset;
      const endVelocity = velocity;
      reset();
      if (!dragged || closing) return;
      if (endOffset > 8) suppressClick = true;
      const height = sheet!.getBoundingClientRect().height || 1;
      const pulledBack = endVelocity < -0.35;
      const flung = endVelocity > 0.55 && endOffset > 24;
      const far = endOffset > Math.min(180, height * 0.3);
      if (!pulledBack && (flung || far)) requestClose();
      else setMotion(0, true);
    }

    function onTouchStart(event: TouchEvent) {
      if (event.timeStamp === seenStart || event.touches.length !== 1) return;
      seenStart = event.timeStamp;
      const touch = event.touches[0];
      if (!touch) return;
      begin(touch.clientY, chrome!.contains(event.target as Node));
    }

    function onTouchMove(event: TouchEvent) {
      if (event.timeStamp === seenMove) return;
      seenMove = event.timeStamp;
      const touch = event.touches[0];
      if (!touch) return;
      move(touch.clientY, event);
    }

    function onPointerDown(event: PointerEvent) {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      if (!begin(event.clientY, chrome!.contains(event.target as Node))) return;
      pointerId = event.pointerId;
    }

    function onPointerMove(event: PointerEvent) {
      if (event.pointerType !== "mouse" || pointerId !== event.pointerId) return;
      move(event.clientY, event);
    }

    function onPointerUp(event: PointerEvent) {
      if (event.pointerType !== "mouse" || pointerId !== event.pointerId) return;
      end();
    }

    function onClickCapture(event: MouseEvent) {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") requestClose();
    }

    sheet.addEventListener("touchstart", onTouchStart, { passive: true });
    scroller.addEventListener("touchstart", onTouchStart, { passive: true });
    sheet.addEventListener("touchmove", onTouchMove, { passive: false });
    scroller.addEventListener("touchmove", onTouchMove, { passive: false });
    sheet.addEventListener("touchend", end);
    sheet.addEventListener("touchcancel", end);
    sheet.addEventListener("pointerdown", onPointerDown);
    sheet.addEventListener("pointermove", onPointerMove);
    sheet.addEventListener("pointerup", onPointerUp);
    sheet.addEventListener("pointercancel", onPointerUp);
    sheet.addEventListener("click", onClickCapture, true);
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previousBody;
      html.style.overflow = previousHtml;
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
      sheet.removeEventListener("touchstart", onTouchStart);
      scroller.removeEventListener("touchstart", onTouchStart);
      sheet.removeEventListener("touchmove", onTouchMove);
      scroller.removeEventListener("touchmove", onTouchMove);
      sheet.removeEventListener("touchend", end);
      sheet.removeEventListener("touchcancel", end);
      sheet.removeEventListener("pointerdown", onPointerDown);
      sheet.removeEventListener("pointermove", onPointerMove);
      sheet.removeEventListener("pointerup", onPointerUp);
      sheet.removeEventListener("pointercancel", onPointerUp);
      sheet.removeEventListener("click", onClickCapture, true);
      scroller.removeEventListener("scroll", syncTouchAction);
    };
  }, []);

  const tree = (
    <div className="ios-sheet-root">
      <div
        ref={backdropRef}
        className={`ios-sheet-backdrop${shown ? " is-shown" : ""}`}
        onClick={() => requestCloseRef.current(1)}
      />
      <div
        ref={sheetRef}
        className={`ios-sheet${shown ? " is-shown" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div ref={chromeRef} className="ios-sheet-chrome">
          <div className="ios-sheet-handle" aria-hidden />
          <div className="mb-3 flex items-start justify-between gap-3">
            <h2 id={titleId} className="text-[20px] font-semibold tracking-[-0.03em]">
              {title}
            </h2>
            <button
              type="button"
              className="text-[15px] font-semibold text-[var(--muted)]"
              onClick={() => requestCloseRef.current(1)}
            >
              Done
            </button>
          </div>
          {action ? <div className="mb-3">{action}</div> : null}
        </div>
        <div ref={scrollRef} className="ios-sheet-body">
          <div className="field-stack pb-3">{children}</div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(tree, document.body);
}
