"use client";

import { FormEvent, useState } from "react";

export default function JoinPage() {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, name, password }),
    });
    const body = await res.json().catch(() => ({ error: "Could not join." }));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Could not join.");
      return;
    }
    window.location.href = "/setup/two-factor";
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--terracotta)]">Shelf</p>
      <h1 className="mt-2 text-[32px] font-semibold tracking-[-0.03em]">Join the household</h1>
      <p className="mt-2 text-[15px] text-[var(--muted)]">Use the one-time code from the owner, then choose your own password.</p>
      <form className="mt-6 space-y-3" onSubmit={onSubmit}>
        <input className="pixel-input" placeholder="Invite code" value={code} onChange={(e) => setCode(e.target.value)} required />
        <input className="pixel-input" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input className="pixel-input" type="password" placeholder="Password (12+)" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error ? <p className="text-[14px] text-[var(--danger)]">{error}</p> : null}
        <button className="pixel-btn w-full" disabled={busy}>
          {busy ? "Joining…" : "Join"}
        </button>
      </form>
    </main>
  );
}
