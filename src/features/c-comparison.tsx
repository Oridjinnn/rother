"use client";

import * as React from "react";
import { Radar } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CompetitorRadarChart } from "@/components/dashboard/charts/radar";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useOverview } from "@/lib/gbp/use-overview";
import type { CompetitorStats } from "@/lib/gbp/types";

export default function ComparisonFeature() {
  const { data, loading } = useOverview();
  const has = (data?.competitorStats.length ?? 0) > 0;
  return (
    <Card className="gbp-card-hover">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Radar className="size-4 text-primary" /> Competitor Comparison
        </CardTitle>
        <CardDescription>
          Top 3 competitors compared across normalized dimensions (0–100).
          Reviews, Rating, New, and Recency (7-day decay).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && !data ? (
          <Skeleton className="h-[320px] w-full" />
        ) : has && data ? (
          <CompetitorRadarChart
            data={data.competitorStats as CompetitorStats[]}
            topN={3}
          />
        ) : (
          <EmptyState
            icon={Radar}
            title="No competitor data yet"
            description="Run the scraper to populate competitor comparison."
            className="h-[320px]"
          />
        )}
      </CardContent>
    </Card>
  );
}
