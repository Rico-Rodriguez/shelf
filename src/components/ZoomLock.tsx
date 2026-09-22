"use client";

import { useEffect } from "react";

/** Soften pinch-zoom without blocking normal taps. */
export function ZoomLock() {
  useEffect(() => {
    const blockGesture = (event: Event) => event.preventDefault();
    document.addEventListener("gesturestart", blockGesture, { passive: false });
    document.addEventListener("gesturechange", blockGesture, { passive: false });
    return () => {
      document.removeEventListener("gesturestart", blockGesture);
      document.removeEventListener("gesturechange", blockGesture);
    };
  }, []);

  return null;
}
