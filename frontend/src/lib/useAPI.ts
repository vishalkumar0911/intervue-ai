// src/lib/useApi.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type KeyPart = string | number | null | undefined;
type Key = KeyPart[];
type Fetcher<T> = () => Promise<T>;

type Options<T> = {
  refreshInterval?: number;
  revalidateOnFocus?: boolean;
  dedupeMs?: number;
  initialData?: T;
};

type CacheEntry<T> = {
  data?: T;
  error?: Error | null;
  ts: number;
  inflight?: Promise<void>;
};

const cache = new Map<string, CacheEntry<any>>();

function keyToString(key: Key): string {
  return JSON.stringify(key ?? []);
}

export function useApi<T>(key: Key, fetcher: Fetcher<T>, opts: Options<T> = {}) {
  const {
    refreshInterval,
    revalidateOnFocus = true,
    dedupeMs = 200,
    initialData,
  } = opts;

  const k = useMemo(() => keyToString(key), [key]);
  const mountedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  // ensure cache entry exists
  if (!cache.has(k)) cache.set(k, { ts: 0 });

  const entry = cache.get(k)!;
  const [data, setDataState] = useState<T | undefined>(initialData ?? entry.data);
  const [error, setError] = useState<Error | null>(entry.error ?? null);
  const [loading, setLoading] = useState<boolean>(!entry.data && initialData === undefined);

  const doFetch = useCallback(async () => {
    const now = Date.now();
    const ce = cache.get(k)!;

    if (ce.inflight) return ce.inflight;          // already fetching
    if (ce.ts && now - ce.ts < dedupeMs) return;  // within dedupe window

    const ctrl = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ctrl;

    const p = (async () => {
      try {
        const res = await fetcher();
        if (!mountedRef.current) return;
        cache.set(k, { data: res, error: null, ts: Date.now() });
        setDataState(res);
        setError(null);
        setLoading(false);
      } catch (e: any) {
        if (!mountedRef.current) return;
        if (e?.name !== "AbortError") {
          setError(e instanceof Error ? e : new Error(String(e)));
          const prev = cache.get(k) ?? { ts: 0 };
          cache.set(k, { ...prev, error: e, ts: Date.now() });
          setLoading(false);
        }
      } finally {
        const cur = cache.get(k);
        if (cur) cur.inflight = undefined;
        if (abortRef.current === ctrl) abortRef.current = null;
      }
    })();

    ce.inflight = p;
    cache.set(k, ce);
    return p;
  }, [fetcher, dedupeMs, k]);

  // initial + key change
  useEffect(() => {
    mountedRef.current = true;
    if (initialData !== undefined) {
      setLoading(false);
    } else {
      setLoading(!entry.data);
      void doFetch();
    }
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);

  // polling
  useEffect(() => {
    if (!refreshInterval) return;
    const id = setInterval(() => void doFetch(), Math.max(500, refreshInterval));
    return () => clearInterval(id);
  }, [refreshInterval, doFetch]);

  // revalidate on focus/visibility
  useEffect(() => {
    if (!revalidateOnFocus) return;
    const onFocus = () => void doFetch();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [revalidateOnFocus, doFetch]);

  // mutate + setData alias (SWR-like)
  const mutate = useCallback(
    (updater: T | ((prev: T | undefined) => T | undefined), options?: { revalidate?: boolean }) => {
      setDataState((prev) => {
        const next = typeof updater === "function" ? (updater as any)(prev) : (updater as T);
        cache.set(k, { ...(cache.get(k) ?? { ts: 0 }), data: next, error: null, ts: Date.now() });
        return next;
      });
      setError(null);
      if (options?.revalidate) {
        setLoading(true);
        void doFetch().finally(() => setLoading(false));
      }
    },
    [k, doFetch]
  );

  // Back-compat with code expecting `setData`
  const setData = mutate;

  return { data, error, loading, refetch: doFetch, mutate, setData };
}

export default useApi;
