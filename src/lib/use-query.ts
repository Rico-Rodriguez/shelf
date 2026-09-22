"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./client";

type Entry<T> = { data: T; at: number };

const STORAGE_KEY = "shelf-queries";
const store = new Map<string, Entry<unknown>>();
const listeners = new Map<string, Set<() => void>>();

function notify(key: string) {
  listeners.get(key)?.forEach((fn) => fn());
}

function hydrateStore() {
  if (typeof window === "undefined") return;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, Entry<unknown>>;
    for (const [key, entry] of Object.entries(parsed)) {
      if (entry && typeof entry === "object" && "data" in entry) store.set(key, entry);
    }
  } catch {
    /* ignore unreadable cache */
  }
}

function persistStore() {
  if (typeof window === "undefined") return;
  const write = () => {
    const obj: Record<string, Entry<unknown>> = {};
    for (const [key, entry] of store) obj[key] = entry;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  };
  try {
    write();
  } catch {
    for (const key of [...store.keys()]) {
      if (key.startsWith("activity:")) store.delete(key);
    }
    try {
      write();
    } catch {
      /* ignore quota */
    }
  }
}

hydrateStore();

export function peekQuery<T>(key: string): T | null {
  return (store.get(key)?.data as T | undefined) ?? null;
}

export function writeQuery<T>(key: string, data: T) {
  store.set(key, { data, at: Date.now() });
  persistStore();
  notify(key);
}

export function warmQuery(key: string, path: string) {
  if (store.has(key)) return;
  void api(path)
    .then((data) => {
      if (!store.has(key)) writeQuery(key, data);
    })
    .catch(() => undefined);
}

export function invalidateQueries(prefix?: string) {
  if (!prefix) {
    store.clear();
    persistStore();
    listeners.forEach((set) => set.forEach((fn) => fn()));
    return;
  }
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) {
      store.delete(key);
      notify(key);
    }
  }
  persistStore();
}

export function useQuery<T>(key: string | null, path: string | null, options?: { keepPrevious?: boolean }) {
  const keepPrevious = options?.keepPrevious ?? false;
  const cached = key ? peekQuery<T>(key) : null;
  const [data, setDataState] = useState<T | null>(cached);
  const [loading, setLoading] = useState(!cached && Boolean(key));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pathRef = useRef(path);
  pathRef.current = path;
  const dataRef = useRef(data);
  dataRef.current = data;
  const keepRef = useRef(keepPrevious);
  keepRef.current = keepPrevious;
  const requestRef = useRef(0);

  const setData = useCallback(
    (value: T | null | ((prev: T | null) => T | null)) => {
      setDataState((prev) => {
        const next = typeof value === "function" ? (value as (p: T | null) => T | null)(prev) : value;
        if (key && next != null) writeQuery(key, next);
        return next;
      });
    },
    [key],
  );

  const load = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (!key || !pathRef.current) return;
      const requestKey = key;
      const requestPath = pathRef.current;
      const id = ++requestRef.current;
      const soft = opts?.soft || store.has(requestKey) || (keepRef.current && dataRef.current != null);
      if (soft) setRefreshing(true);
      else {
        setLoading(true);
        setError(null);
      }
      try {
        const next = await api<T>(requestPath);
        if (id !== requestRef.current) return;
        writeQuery(requestKey, next);
        setDataState(next);
        setError(null);
      } catch (err) {
        if (id !== requestRef.current) return;
        const message = err instanceof Error ? err.message : "Could not load";
        if (message === "locked") return;
        const hasData = store.has(requestKey) || dataRef.current != null;
        if (!hasData) setError(message || "Could not load");
      } finally {
        if (id !== requestRef.current) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [key],
  );

  useEffect(() => {
    if (!key) return;
    const hit = peekQuery<T>(key);
    if (hit) {
      setDataState(hit);
      setLoading(false);
    } else if (keepRef.current && dataRef.current != null) {
      setLoading(false);
      setRefreshing(true);
    } else {
      setDataState(null);
      setLoading(true);
    }
    const onChange = () => {
      const next = peekQuery<T>(key);
      if (next != null) setDataState(next);
      else if (!keepRef.current) setDataState(null);
    };
    const set = listeners.get(key) ?? new Set();
    set.add(onChange);
    listeners.set(key, set);
    void load({ soft: Boolean(hit) || (keepRef.current && dataRef.current != null) });
    return () => {
      set.delete(onChange);
    };
  }, [key, load]);

  return { data, loading, refreshing, error, reload: () => load({ soft: true }), setData };
}
