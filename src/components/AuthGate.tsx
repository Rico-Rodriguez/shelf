"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { peekQuery, writeQuery } from "@/lib/use-query";
import { Icon } from "./Icon";
import { AppShell } from "./AppShell";
import { SyncPoller } from "./SyncPoller";
import { PageSkeleton } from "./ui/PageShell";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [plaid, setPlaid] = useState(false);

  useLayoutEffect(() => {
    const cached = peekQuery<{ plaidConfigured?: boolean; itemCount?: number }>("dashboard");
    if (!cached) return;
    setPlaid(Boolean(cached.plaidConfigured && (cached.itemCount ?? 0) > 0));
    setReady(true);
  }, []);

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
      ]);
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return (
      <div className="boot-shell" aria-busy="true" aria-label="Opening Shelf">
        <div className="mobile-bar md:hidden">
          <span />
          <span className="brand-mark mobile-brand">Shelf</span>
          <span />
        </div>
        <div className="app-main">
          <PageSkeleton variant="home" />
        </div>
        <nav className="ios-tabbar md:hidden" aria-hidden>
          {(
            [
              ["home", "Home"],
              ["list", "Activity"],
              ["chart", "Budget"],
              ["wallet", "Accounts"],
              ["more", "More"],
            ] as const
          ).map(([icon, label], index) => (
            <span key={label} className={`ios-tab ${index === 0 ? "active" : ""}`}>
              <span className="ios-tab-glyph">
                <Icon name={icon} size={index === 4 ? 22 : 24} filled={index === 0} />
              </span>
              {label}
            </span>
          ))}
        </nav>
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
