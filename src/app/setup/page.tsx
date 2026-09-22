"use client";

import { FormEvent, useEffect, useState } from "react";

export default function SetupPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/session")
      .then((r) => r.json())
      .then((s) => {
        if (!s.needsSetup) window.location.href = s.unlocked ? "/" : "/login";
      });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Those two don’t match.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/auth/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Could not set the lock." }));
      setError(body.error);
      return;
    }
    window.location.href = "/setup/two-factor";
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5">
        <div>
          <p className="text-[15px] font-semibold text-[var(--ink)]">Shelf</p>
          <h1 className="mt-2 text-[34px] font-bold tracking-tight">Choose a password</h1>
          <p className="mt-1 text-[15px] text-[var(--muted)]">
            Twelve or more characters. This is what opens Shelf on this device.
          </p>
        </div>
        <input
          className="shelf-input"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password"
        />
        <input
          className="shelf-input"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Confirm"
        />
        {error ? <p className="text-[15px] text-[var(--ink)]">{error}</p> : null}
        <button className="shelf-btn w-full" disabled={busy}>
          {busy ? "Saving…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
