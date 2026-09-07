"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Pie/donut chart — wrapped in `next/dynamic` so the heavier Recharts PieChart
 * bundle is code-split out of the initial feature chunk and only loaded when a
 * feature that needs it actually mounts.
 */
export const SentimentDistributionChart = dynamic(
  () => import("./sentiment-impl").then((m) => m.SentimentDistributionChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[260px] w-full rounded-lg" />,
  },
);
