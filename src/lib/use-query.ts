"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./client";

type Entry<T> = { data: T; at: number };

const store = new Map<string, Entry<unknown>>();
const listeners = new Map<string, Set<() => void>>();

function notify(key: string) {
  listeners.get(key)?.forEach((fn) => fn());
}

export function peekQuery<T>(key: string): T | null {
  return (store.get(key)?.data as T | undefined) ?? null;
}

export function writeQuery<T>(key: string, data: T) {
  store.set(key, { data, at: Date.now() });
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
    listeners.forEach((set) => set.forEach((fn) => fn()));
    return;
  }
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) {
      store.delete(key);
      notify(key);
    }
  }
}

export function useQuery<T>(key: string | null, path: string | null, options?: { keepPrevious?: boolean }) {
  const keepPrevious = options?.keepPrevious ?? false;
  const cached = key ? peekQuery<T>(key) : null;
  const [data, setDataState] = useState<T | null>(cached);
  const [loading, setLoading] = useState(!cached && Boolean(key));
  const [refreshing, setRefreshing] = useState(false);
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
      else setLoading(true);
      try {
        const next = await api<T>(requestPath);
        if (id !== requestRef.current) return;
        writeQuery(requestKey, next);
        setDataState(next);
      } catch {
        // Keep the last payload on screen when a refresh fails.
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

  return { data, loading, refreshing, reload: () => load({ soft: true }), setData };
}
