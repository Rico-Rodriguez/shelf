"use client";

import { useEffect, useState } from "react";
import { writeQuery } from "@/lib/use-query";
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
      if (session.needsEnroll) {
        window.location.href = "/setup/two-factor";
        return;
      }
      if (!session.unlocked) {
        window.location.href = "/login";
        return;
      }
      try {
        const dash = await fetch("/api/dashboard").then((r) => r.json());
        writeQuery("dashboard", dash);
        setPlaid(Boolean(dash.plaidConfigured && dash.itemCount > 0));
      } catch {
        setPlaid(false);
      }
      void Promise.allSettled([
        fetch("/api/accounts").then(async (r) => (r.ok ? writeQuery("accounts", await r.json()) : null)),
        fetch("/api/budget").then(async (r) => (r.ok ? writeQuery("budget:current", await r.json()) : null)),
        fetch("/api/cash-flow?grain=month&months=12").then(async (r) =>
          r.ok ? writeQuery("cash-flow:grain=month&months=12", await r.json()) : null,
        ),
      ]);
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2">
        <p className="text-[17px] font-semibold tracking-[-0.41px]">Shelf</p>
        <p className="text-[15px] text-[var(--muted)]">Opening…</p>
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
