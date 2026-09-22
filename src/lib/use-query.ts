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

export function useQuery<T>(key: string | null, path: string | null) {
  const cached = key ? peekQuery<T>(key) : null;
  const [data, setDataState] = useState<T | null>(cached);
  const [loading, setLoading] = useState(!cached && Boolean(key));
  const [refreshing, setRefreshing] = useState(false);
  const pathRef = useRef(path);
  pathRef.current = path;

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
      const soft = opts?.soft || store.has(key);
      if (soft) setRefreshing(true);
      else setLoading(true);
      try {
        const next = await api<T>(pathRef.current);
        writeQuery(key, next);
        setDataState(next);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [key],
  );

  useEffect(() => {
    if (!key) return;
    const hit = peekQuery<T>(key);
    setDataState(hit);
    setLoading(!hit);
    const onChange = () => setDataState(peekQuery<T>(key));
    const set = listeners.get(key) ?? new Set();
    set.add(onChange);
    listeners.set(key, set);
    void load({ soft: Boolean(hit) });
    return () => {
      set.delete(onChange);
    };
  }, [key, load]);

  return { data, loading, refreshing, reload: () => load({ soft: true }), setData };
}
