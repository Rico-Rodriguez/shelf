"use client";

import { FormEvent, useEffect, useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/session")
      .then((r) => r.json())
      .then((s) => {
        if (s.needsSetup) window.location.href = "/setup";
        if (s.unlocked) window.location.href = "/";
      });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Nope." }));
      setError(body.error);
      return;
    }
    window.location.href = "/";
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[var(--terracotta)]">Shelf</p>
          <h1 className="mt-2 text-[34px] font-bold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-[15px] text-[var(--muted)]">Enter your lock to open the room.</p>
        </div>
        <input
          className="pixel-input"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
        />
        {error ? <p className="text-[15px] text-[var(--terracotta)]">{error}</p> : null}
        <button className="pixel-btn w-full" disabled={busy}>
          {busy ? "Unlocking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}
