"use client";

import { useCallback, useState } from "react";
import { usePlaidLink, type PlaidLinkOnSuccess } from "react-plaid-link";
import { api } from "@/lib/client";

export function ConnectBank({ onLinked }: { onLinked?: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ linkToken: string }>("/api/plaid/link-token", { method: "POST" });
      setToken(res.linkToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start Plaid");
    } finally {
      setBusy(false);
    }
  };

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    async (public_token, metadata) => {
      if (!public_token) return;
      setBusy(true);
      try {
        await api("/api/plaid/exchange", {
          method: "POST",
          body: JSON.stringify({ public_token, metadata }),
        });
        onLinked?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not link");
      } finally {
        setBusy(false);
        setToken(null);
      }
    },
    [onLinked],
  );

  const { open, ready } = usePlaidLink({ token, onSuccess });

  return (
    <div className="space-y-2">
      {!token ? (
        <button type="button" className="pixel-btn" onClick={start} disabled={busy}>
          {busy ? "Opening the box…" : "Connect a bank"}
        </button>
      ) : (
        <button type="button" className="pixel-btn" onClick={() => open()} disabled={!ready}>
          Continue with Plaid
        </button>
      )}
      {error ? <p className="text-sm text-rose">{error}</p> : null}
    </div>
  );
}
