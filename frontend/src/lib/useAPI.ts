// src/lib/useApi.ts
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Key = (string | number | null | undefined)[];
type Fetcher<T> = () => Promise<T>;

type Options = {
  refreshInterval?: number;
  revalidateOnFocus?: boolean;
  dedupeMs?: number;
  initialData?: any;
};

type CacheEntry<T> = {
  data?: T;
  error?: Error | null;
  ts: number;
  inflight?: Promise<T>;
};

const cache = new Map<string, CacheEntry<any>>();

function keyToString(key: Key): string {
  return JSON.stringify(key ?? []);
}

export function useApi<T>(key: Key, fetcher: Fetcher<T>, opts: Options = {}) {
  const { refreshInterval, revalidateOnFocus = true, dedupeMs = 200, initialData } = opts;

  const k = useMemo(() => keyToString(key), [key]);
  const mounted = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  // hydrate local state from cache/initialData
  const entry = cache.get(k) ?? { ts: 0 };
  if (!cache.has(k)) cache.set(k, entry);
  const [data, setData] = useState<T | undefined>(initialData ?? entry.data);
  const [error, setError] = useState<Error | null>(entry.error ?? null);
  const [loading, setLoading] = useState<boolean>(!entry.data && !initialData);

  const doFetch = async () => {
    const now = Date.now();
    const current = cache.get(k)!;

    if (current.inflight) return current.inflight;
    if (current.ts && now - current.ts < dedupeMs) return current.data as T;

    const ctrl = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ctrl;

    const p = (async () => {
      try {
        const res = await fetcher();
        if (!mounted.current) return res;
        cache.set(k, { data: res, error: null, ts: Date.now() });
        setData(res);
        setError(null);
        setLoading(false);
        return res;
      } catch (e: any) {
        if (!mounted.current) throw e;
        const err = e?.name === "AbortError" ? null : e;
        if (err) {
          cache.set(k, { ...(cache.get(k) ?? { ts: 0 }), error: err, ts: Date.now() });
          setError(err);
          setLoading(false);
        }
        throw e;
      } finally {
        const ce = cache.get(k);
        if (ce) ce.inflight = undefined;
        if (abortRef.current === ctrl) abortRef.current = null;
      }
    })();

    current.inflight = p as Promise<T>;
    cache.set(k, current);
    return p;
  };

  useEffect(() => {
    mounted.current = true;
    if (initialData !== undefined) {
      setLoading(false);
    } else {
      setLoading(!data);
      doFetch().catch(() => {});
    }
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);

  useEffect(() => {
    if (!refreshInterval) return;
    const id = setInterval(() => {
      doFetch().catch(() => {});
    }, Math.max(500, refreshInterval));
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, refreshInterval]);

  useEffect(() => {
    if (!revalidateOnFocus) return;
    const onFocus = () => doFetch().catch(() => {});
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, revalidateOnFocus]);

  async function mutate(
    updater: T | ((prev: T | undefined) => T | undefined),
    opts?: { revalidate?: boolean }
  ) {
    const next =
      typeof updater === "function" ? (updater as any)(cache.get(k)?.data) : updater;
    cache.set(k, { ...(cache.get(k) ?? { ts: 0 }), data: next, error: null, ts: Date.now() });
    setData(next);
    setError(null);
    if (opts?.revalidate) {
      setLoading(true);
      try {
        await doFetch();
      } finally {
        setLoading(false);
      }
    }
  }

  return { data, error, loading, refetch: doFetch, mutate };
}
