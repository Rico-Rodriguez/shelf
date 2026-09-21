"use client";

import { useEffect } from "react";

export function SyncPoller({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    const tick = (pendingOnly: boolean) => {
      window.dispatchEvent(new CustomEvent("shelf-sync", { detail: "syncing" }));
      void fetch("/api/plaid/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pendingOnly }),
      })
        .then((res) => {
          window.dispatchEvent(new CustomEvent("shelf-sync", { detail: res.ok || res.status === 403 ? "synced" : "error" }));
        })
        .catch(() => {
          window.dispatchEvent(new CustomEvent("shelf-sync", { detail: "error" }));
        });
    };
    tick(false);
    const onFocus = () => tick(true);
    window.addEventListener("focus", onFocus);
    const pending = window.setInterval(() => tick(true), 60 * 1000);
    const full = window.setInterval(() => tick(false), 15 * 60 * 1000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(pending);
      window.clearInterval(full);
    };
  }, [enabled]);
  return null;
}
