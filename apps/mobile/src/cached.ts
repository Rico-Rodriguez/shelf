import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { load, peek, subscribeCache } from "./api";

/**
 * A GET that paints from the cache first and refreshes behind it each time the
 * screen comes into view. An error shows only when there is nothing to show.
 * With `keep`, the last page stays up while a new path loads, so changing a
 * filter or a month does not blank the screen.
 */
export function useCached<T>(path: string | null, options: { keep?: boolean; fallback?: string } = {}) {
  const [data, setData] = useState<T | undefined>(() => (path ? peek<T>(path) : undefined));
  const [error, setError] = useState<string | null>(null);
  const current = useRef(path);
  current.current = path;
  const keep = options.keep ?? false;

  useEffect(() => {
    if (!path) {
      setData(undefined);
      return;
    }
    const cached = peek<T>(path);
    setData((before) => cached ?? (keep ? before : undefined));
    return subscribeCache<T>(path, (next) => {
      if (next !== undefined && current.current === path) setData(next);
    });
  }, [path, keep]);

  const fallback = options.fallback ?? "Could not load this page";
  const reload = useCallback((): Promise<T | undefined> => {
    if (!path) return Promise.resolve(undefined);
    return load<T>(path)
      .then((next) => {
        if (current.current === path) {
          setData(next);
          setError(null);
        }
        return next;
      })
      .catch((err: unknown) => {
        if (current.current === path) setError(err instanceof Error ? err.message : fallback);
        return undefined;
      });
  }, [path, fallback]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return {
    data,
    /** Only set when nothing could be shown. */
    error: data === undefined ? error : null,
    loading: data === undefined && !error,
    reload,
  };
}
