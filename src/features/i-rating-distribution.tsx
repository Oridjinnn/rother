"use client";

import * as React from "react";
import { Star } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RatingDistributionChart } from "@/components/dashboard/charts/rating-distribution";
import { SentimentDistributionChart } from "@/components/dashboard/charts/sentiment";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useOverview } from "@/lib/gbp/use-overview";

export default function RatingDistributionFeature() {
  const { data, loading } = useOverview();
  const has = (data?.totalReviews ?? 0) > 0;
  return (
    <Card className="gbp-card-hover">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Star className="size-4 text-primary" /> Rating Distribution
        </CardTitle>
        <CardDescription>
          Star ratings across all monitored reviews (1★–5★)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && !data ? (
          <Skeleton className="h-[260px] w-full" />
        ) : has && data ? (
          <div className="space-y-4">
            <RatingDistributionChart data={data.ratingDistribution} />
            <div className="border-t border-border/60 pt-4">
              <SentimentDistributionChart data={data.ratingDistribution} />
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Star}
            title="No ratings yet"
            description="The scraper hasn't produced any snapshots."
            className="h-[260px]"
          />
        )}
      </CardContent>
    </Card>
  );
}
