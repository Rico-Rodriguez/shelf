"use client";

import { FormEvent, useEffect, useState } from "react";

type Step = "loading" | "google" | "password" | "totp";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("loading");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const flag = new URLSearchParams(window.location.search).get("google");
    if (flag === "mismatch") setError("That Google account isn't this Shelf.");
    else if (flag === "denied") setError("Google sign-in was cancelled.");
    else if (flag) setError("Google sign-in didn't complete.");
    void fetch("/api/auth/session")
      .then((r) => r.json())
      .then((s) => {
        if (s.googleEmail) setEmail(s.googleEmail);
        if (s.needsSetup) window.location.href = "/setup";
        else if (s.needsEnroll) window.location.href = "/setup/two-factor";
        else if (s.unlocked) window.location.href = "/";
        else if (s.needsGoogle) setStep("google");
        else if (s.needsTotp) setStep("totp");
        else setStep("password");
      });
  }, []);

  async function onPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const body = await res.json().catch(() => ({ error: "That didn’t work. Try again." }));
    setBusy(false);
    if (!res.ok) {
      setError(body.error);
      return;
    }
    if (body.needEnroll) {
      window.location.href = "/setup/two-factor";
      return;
    }
    if (body.needTotp) {
      setStep("totp");
      setPassword("");
      return;
    }
    window.location.href = "/";
  }

  async function onCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/totp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const body = await res.json().catch(() => ({ error: "That didn’t work. Try again." }));
    setBusy(false);
    if (!res.ok) {
      setError(body.error);
      if (res.status === 429) setStep("password");
      return;
    }
    window.location.href = "/";
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      {step === "loading" ? (
        <p className="text-[var(--muted)]">Opening…</p>
      ) : step === "google" ? (
        <div className="w-full max-w-sm space-y-5">
          <div>
            <p className="brand-mark text-[28px]">Shelf</p>
            <h1 className="mt-2 text-[34px] font-bold tracking-tight">Sign in</h1>
            <p className="mt-1 text-[15px] text-[var(--muted)]">Use the Google account this Shelf belongs to.</p>
          </div>
          {error ? <p className="text-[15px] text-[var(--danger)]">{error}</p> : null}
          <a className="shelf-btn flex w-full items-center justify-center" href="/api/auth/google">
            Continue with Google
          </a>
        </div>
      ) : step === "password" ? (
        <form onSubmit={onPassword} className="w-full max-w-sm space-y-5">
          <div>
            <p className="brand-mark text-[28px]">Shelf</p>
            <h1 className="mt-2 text-[34px] font-bold tracking-tight">Welcome back</h1>
            <p className="mt-1 text-[15px] text-[var(--muted)]">
              {email ? `Continue as ${email}.` : "Enter your password to open Shelf."}
            </p>
          </div>
          <label className="field">
            <span className="field-label">Password</span>
            <input
              className="shelf-input"
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error ? <p className="text-[15px] text-[var(--danger)]">{error}</p> : null}
          <button className="shelf-btn w-full" disabled={busy}>
            {busy ? "Checking…" : "Continue"}
          </button>
        </form>
      ) : (
        <form onSubmit={onCode} className="w-full max-w-sm space-y-5">
          <div>
            <p className="brand-mark text-[28px]">Shelf</p>
            <h1 className="mt-2 text-[34px] font-bold tracking-tight">Authenticator</h1>
            <p className="mt-1 text-[15px] text-[var(--muted)]">Enter the 6-digit code from your app.</p>
          </div>
          <label className="field">
            <span className="field-label">Code</span>
            <input
              className="shelf-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
            />
          </label>
          {error ? <p className="text-[15px] text-[var(--danger)]">{error}</p> : null}
          <button className="shelf-btn w-full" disabled={busy}>
            {busy ? "Checking…" : "Unlock"}
          </button>
        </form>
      )}
    </div>
  );
}
