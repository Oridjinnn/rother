"use client";

import type { CompetitorStats } from "@/lib/gbp/types";

import { CompetitorLeaderboard } from "@/components/dashboard/competitor-leaderboard";
import { useOverview } from "@/lib/gbp/use-overview";

export default function LeaderboardFeature() {
  const { data, loading } = useOverview();
  return (
    <CompetitorLeaderboard
      data={data ? (data.competitorStats as CompetitorStats[]) : null}
      loading={loading}
    />
  );
}
