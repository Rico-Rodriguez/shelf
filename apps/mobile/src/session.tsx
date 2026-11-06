import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import { api, ApiError, cacheHydrationPromise, getToken, setToken } from "./api";

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
  refresh: () => Promise<ShelfState | null>;
  signOut: () => Promise<void>;
  lock: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

const SESSION_STATE_KEY = "shelf.session.state";
const LOCK_KEY = "shelf.locked";

async function readLocked() {
  try {
    return (await SecureStore.getItemAsync(LOCK_KEY)) === "1";
  } catch {
    return false;
  }
}

function canEnter(parsed: ShelfState) {
  return Boolean(parsed?.unlocked && !parsed.needsGoogle && !parsed.needsSetup && !parsed.needsEnroll && !parsed.needsTotp);
}

export async function clearLock() {
  await SecureStore.deleteItemAsync(LOCK_KEY).catch(() => undefined);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<ShelfState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const answered = useRef(false);

  useEffect(() => {
    void (async () => {
      try {
        const [token, cached, locked] = await Promise.all([
          getToken(),
          SecureStore.getItemAsync(SESSION_STATE_KEY),
          readLocked(),
        ]);
        if (locked || !token || !cached) return;
        const parsed = JSON.parse(cached) as ShelfState;
        if (canEnter(parsed)) {
          // Let the saved pages land first so Home opens with numbers, not a spinner.
          await Promise.race([cacheHydrationPromise, new Promise((resolve) => setTimeout(resolve, 700))]);
          if (answered.current) return;
          setState(parsed);
          setReady(true);
        }
      } catch {
        // Ignore a bad cache and wait for the network check.
      }
    })();
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await Promise.race([
        api<ShelfState>("/api/auth/session"),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Shelf took too long to answer. Check the connection and open the app again.")), 12000);
        }),
      ]);
      const locked = await readLocked();
      const shown = locked ? { ...next, unlocked: false } : next;
      answered.current = true;
      setState(shown);
      setError(null);
      void SecureStore.setItemAsync(SESSION_STATE_KEY, JSON.stringify(shown)).catch(() => undefined);
      return shown;
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        answered.current = true;
        setState(null);
        void SecureStore.deleteItemAsync(SESSION_STATE_KEY).catch(() => undefined);
      }
      setError(err instanceof ApiError ? err.message : "Could not reach Shelf.");
      return null;
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
    await SecureStore.deleteItemAsync(LOCK_KEY).catch(() => undefined);
    await SecureStore.deleteItemAsync(SESSION_STATE_KEY).catch(() => undefined);
    await refresh();
  }, [refresh]);

  const lock = useCallback(async () => {
    await SecureStore.setItemAsync(LOCK_KEY, "1").catch(() => undefined);
    setState((current) => {
      const next = current ? { ...current, unlocked: false } : current;
      if (next) void SecureStore.setItemAsync(SESSION_STATE_KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
    setError(null);
  }, []);

  const value = useMemo(
    () => ({ ready, state, error, refresh, signOut, lock }),
    [ready, state, error, refresh, signOut, lock],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("SessionProvider is missing");
  return value;
}
