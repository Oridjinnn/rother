"use client";

import type { OverviewResponse } from "@/lib/gbp/types";
import { useApiQuery } from "@/lib/gbp/use-api-query";

// C4 / TD-H08: now backed by the unified `useApiQuery` (TanStack Query) hook —
// see use-api-query.ts. The previous module-level 15s TTL cache is redundant:
// TanStack Query coalesces concurrent requests and caches per queryKey.
export function useOverview() {
  return useApiQuery<OverviewResponse>("overview", "/api/overview");
}
