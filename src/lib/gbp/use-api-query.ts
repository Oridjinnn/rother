"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

/**
 * C4 / TD-H08 — single, sanctioned data-acquisition hook for the dashboard.
 *
 * Replaces the hand-rolled per-component `fetch` + module-level TTL cache
 * pattern (which duplicated caching logic in `use-overview`/`use-branches`).
 * TanStack Query already ships in the app (used by `OnlineStatusProvider`), so
 * we lean on its cache + request coalescing for unified acquisition: concurrent
 * mounts of the same key share one in-flight request and share a cached result
 * for `staleTime`, eliminating the redundant /api/* stampede.
 */
/**
 * Per-endpoint cache tuning. Live tabs (overview, reviews, alerts, scrape
 * status) stay at `no-store` + 15s staleTime. Static endpoints (geo-grid,
 * config/selectors, logs, history, competitor-correlation) opt into a long
 * `staleTime` (5 min) and drop `no-store` so the browser/React Query can serve
 * a cached response and avoid refetch storms while navigating between tabs.
 */
export interface UseApiQueryOptions {
  static?: boolean;
}

export function useApiQuery<T>(
  key: string,
  url: string,
  options: UseApiQueryOptions = {},
) {
  const isStatic = options.static === true;
  const result = useQuery<T>({
    queryKey: [key],
    queryFn: async () => {
      const r = await fetch(url, isStatic ? {} : { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as T;
    },
    staleTime: isStatic ? 5 * 60_000 : 15_000,
    refetchOnWindowFocus: false,
  });

  return {
    data: result.data ?? null,
    loading: result.isLoading,
    error: result.error ? (result.error as Error).message : null,
    refresh: () => result.refetch(),
  };
}
