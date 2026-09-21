"use client";

import { FormEvent, useEffect, useState } from "react";

export default function TwoFactorPage() {
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const session = await fetch("/api/auth/session").then((r) => r.json());
      if (session.needsSetup) {
        window.location.href = "/setup";
        return;
      }
      if (session.unlocked) {
        window.location.href = "/";
        return;
      }
      if (!session.needsEnroll) {
        window.location.href = "/login";
        return;
      }
      const res = await fetch("/api/auth/totp/setup");
      if (!res.ok) {
        window.location.href = "/login";
        return;
      }
      const body = (await res.json()) as { qr: string; secret: string };
      setQr(body.qr);
      setSecret(body.secret);
    })();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/totp/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const body = await res.json().catch(() => ({ error: "Could not confirm." }));
    setBusy(false);
    if (!res.ok) {
      setError(body.error);
      return;
    }
    window.location.href = "/";
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-10">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5">
        <div>
          <p className="text-[15px] font-semibold text-[var(--terracotta)]">Shelf</p>
          <h1 className="mt-2 text-[34px] font-bold tracking-tight">Add an authenticator</h1>
          <p className="mt-1 text-[15px] text-[var(--muted)]">
            Scan this with 1Password, Google Authenticator, or Authy. The app stays locked until this is on.
          </p>
        </div>
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="Authenticator QR code" className="mx-auto rounded-2xl bg-white p-3" />
        ) : (
          <p className="text-[var(--muted)]">Preparing the code…</p>
        )}
        {secret ? (
          <p className="break-all text-center text-[13px] text-[var(--muted)]">
            Or enter this key manually: {secret}
          </p>
        ) : null}
        <input
          className="pixel-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="6-digit code"
        />
        {error ? <p className="text-[15px] text-[var(--terracotta)]">{error}</p> : null}
        <button className="pixel-btn w-full" disabled={busy || !secret}>
          {busy ? "Confirming…" : "Turn on 2FA"}
        </button>
      </form>
    </div>
  );
}
