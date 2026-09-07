"use client";

import type { BranchesResponse } from "@/lib/gbp/types";
import { useApiQuery } from "@/lib/gbp/use-api-query";

// C4 / TD-H08: unified data acquisition via `useApiQuery` (TanStack Query).
export function useBranches() {
  return useApiQuery<BranchesResponse>("branches", "/api/branches");
}
