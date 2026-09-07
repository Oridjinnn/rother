"use client";

import * as React from "react";
import { MapPin } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NewReviewsPerBranchChart } from "@/components/dashboard/charts/new-reviews-per-branch";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useOverview } from "@/lib/gbp/use-overview";

export default function NewReviewsPerBranchFeature() {
  const { data, loading } = useOverview();
  const has = (data?.newReviewsPerBranch.length ?? 0) > 0;
  return (
    <Card className="gbp-card-hover">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="size-4 text-primary" /> New Reviews per Branch
        </CardTitle>
        <CardDescription>
          New reviews detected in the latest run, grouped by branch
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && !data ? (
          <Skeleton className="h-[260px] w-full" />
        ) : has && data ? (
          <NewReviewsPerBranchChart data={data.newReviewsPerBranch} />
        ) : (
          <EmptyState
            icon={MapPin}
            title="No new reviews"
            description="No new reviews found in the latest update."
            className="h-[260px]"
          />
        )}
      </CardContent>
    </Card>
  );
}
