import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError, getToken, setToken } from "./api";

export type ShelfState = {
  needsSetup: boolean;
  demoLoaded: boolean;
  needsGoogle: boolean;
  googleEmail: string | null;
  role: string;
  unlocked: boolean;
  needsEnroll: boolean;
  needsTotp: boolean;
};

type SessionContextValue = {
  ready: boolean;
  state: ShelfState | null;
  error: string | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<ShelfState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await api<ShelfState>("/api/auth/session");
      setState(next);
      setError(null);
    } catch (err) {
      setState(null);
      setError(err instanceof ApiError ? err.message : "Could not reach Shelf.");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    try {
      if (await getToken()) await api("/api/auth/logout", { method: "POST" });
    } catch {
      // The local token is cleared either way.
    }
    await setToken(null);
    await refresh();
  }, [refresh]);

  const value = useMemo(() => ({ ready, state, error, refresh, signOut }), [ready, state, error, refresh, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("SessionProvider is missing");
  return value;
}
