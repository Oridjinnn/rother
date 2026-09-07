"use client";

import type { CompetitorStats } from "@/lib/gbp/types";

import { CompetitorGrowthRate } from "@/components/dashboard/competitor-growth-rate";
import { useOverview } from "@/lib/gbp/use-overview";

export default function GrowthRateFeature() {
  const { data, loading } = useOverview();
  return (
    <CompetitorGrowthRate
      data={data ? (data.competitorStats as CompetitorStats[]) : null}
      loading={loading}
    />
  );
}
