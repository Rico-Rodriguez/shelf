"use client";

import { useEffect, useState } from "react";
import { AppShell } from "./AppShell";
import { SyncPoller } from "./SyncPoller";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [plaid, setPlaid] = useState(false);

  useEffect(() => {
    void (async () => {
      const session = await fetch("/api/auth/session").then((r) => r.json());
      if (session.needsSetup) {
        window.location.href = "/setup";
        return;
      }
      if (!session.unlocked) {
        window.location.href = "/login";
        return;
      }
      try {
        const dash = await fetch("/api/dashboard").then((r) => r.json());
        setPlaid(Boolean(dash.plaidConfigured && dash.itemCount > 0));
      } catch {
        setPlaid(false);
      }
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2">
        <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[var(--terracotta)]">Shelf</p>
        <p className="text-[var(--muted)]">Opening…</p>
      </div>
    );
  }

  return (
    <AppShell>
      <SyncPoller enabled={plaid} />
      {children}
    </AppShell>
  );
}
