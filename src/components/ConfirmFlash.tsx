"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ConfirmMark } from "@/components/ConfirmMark";

const HOLD_MS = 560;

export function ConfirmFlash({ label = "Saved" }: { label?: string }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="confirm-burst is-screen" role="status" aria-label={label}>
      <ConfirmMark />
    </div>,
    document.body,
  );
}

/** Runs work, then holds a drawn check on screen before resolving. */
export function useConfirmFlash() {
  const [on, setOn] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (work: () => Promise<void>) => {
    await work();
    if (!mounted.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setOn(true);
    await new Promise((resolve) => window.setTimeout(resolve, HOLD_MS));
    if (mounted.current) setOn(false);
  }, []);

  return { flash: on ? <ConfirmFlash /> : null, run };
}
