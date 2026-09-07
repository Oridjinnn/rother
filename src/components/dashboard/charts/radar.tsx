"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

import type { CompetitorStats } from "@/lib/gbp/types";

/**
 * Radar chart — wrapped in `next/dynamic` so the heavier Recharts RadarChart
 * bundle is code-split out of the initial feature chunk and only loaded when a
 * feature that needs it actually mounts.
 */
export const CompetitorRadarChart = dynamic<
  { data: CompetitorStats[]; topN?: number }
>(
  () => import("./radar-impl").then((m) => m.CompetitorRadarChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[320px] w-full rounded-lg" />,
  },
);
