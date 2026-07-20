"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { RefreshCw, TrendingUp } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { ReviewsOverTimeChart } from "./charts";
import { EmptyState } from "./empty-state";
import type { ReviewsOverTimeResponse } from "@/lib/gbp/types";

interface ReviewsOverTimeCardProps {
  /** Bump to force a refetch. */
  refreshKey?: number;
}

/**
 * "Reviews count over time" card — a full-width area chart showing the
 * cumulative review count growth across all scrape runs. Self-fetches
 * from /api/reviews-over-time on mount + when refreshKey changes.
 *
 * Shows the total review count as a badge in the card header, and the
 * area chart with a gradient fill below. Empty state when no scrape
 * history exists.
 */
export function ReviewsOverTimeCard({ refreshKey }: ReviewsOverTimeCardProps) {
  const [data, setData] = React.useState<ReviewsOverTimeResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchData = React.useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/reviews-over-time", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `failed (${res.status})`);
      }
      const json: ReviewsOverTimeResponse = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData, refreshKey]);

  return (
    <Card className="gbp-card-hover">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="size-4 text-primary" aria-hidden="true" />
              Reviews Count Over Time
              {data && data.totalReviews > 0 && (
                <Badge
                  variant="outline"
                  className="ml-1 gap-1 px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
                >
                  {data.totalReviews} total
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Cumulative reviews monitored over time — shows the
              growth trend.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchData}
            className="text-xs text-muted-foreground hover:text-foreground"
            aria-label="Refresh reviews over time"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && !data ? (
          <Skeleton className="h-[260px] w-full rounded-md" />
        ) : error ? (
          <EmptyState
            icon={RefreshCw}
            title="Couldn't load time series"
            description={error}
            className="h-[260px]"
          />
        ) : data && data.data.length > 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <ReviewsOverTimeChart data={data.data} />
          </motion.div>
        ) : (
          <EmptyState
            icon={TrendingUp}
            title="No scrape history yet"
            description="The chart will populate once scraper runs start accumulating reviews."
            className="h-[260px]"
          />
        )}
      </CardContent>
    </Card>
  );
}
