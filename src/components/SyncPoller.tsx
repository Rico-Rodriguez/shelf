"use client";

import { useEffect } from "react";

export function SyncPoller({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      void fetch("/api/plaid/sync", { method: "POST", body: "{}" });
    };
    const onFocus = () => tick();
    window.addEventListener("focus", onFocus);
    const id = window.setInterval(tick, 15 * 60 * 1000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(id);
    };
  }, [enabled]);
  return null;
}
