"use client";

import { useEffect } from "react";

export function ZoomLock() {
  useEffect(() => {
    const blockGesture = (event: Event) => event.preventDefault();
    document.addEventListener("gesturestart", blockGesture, { passive: false });
    document.addEventListener("gesturechange", blockGesture, { passive: false });

    let lastTap = 0;
    const blockDoubleTap = (event: TouchEvent) => {
      const now = Date.now();
      if (now - lastTap < 320) event.preventDefault();
      lastTap = now;
    };
    document.addEventListener("touchend", blockDoubleTap, { passive: false });

    return () => {
      document.removeEventListener("gesturestart", blockGesture);
      document.removeEventListener("gesturechange", blockGesture);
      document.removeEventListener("touchend", blockDoubleTap);
    };
  }, []);

  return null;
}
