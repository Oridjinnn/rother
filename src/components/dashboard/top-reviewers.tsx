"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { RefreshCw, Users } from "lucide-react";

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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { StarRating } from "./star-rating";
import { EmptyState } from "./empty-state";
import { cleanReviewerName } from "@/lib/gbp/format";
import type { Review } from "@/lib/gbp/types";

interface TopReviewersProps {
  /** Bump to force a refetch. */
  refreshKey?: number;
}

interface ReviewerEntry {
  name: string;
  reviewCount: number;
  avgRating: number;
  competitors: Set<string>;
  branches: Set<string>;
  latestDate: string | null;
  reviewIds: string[];
}

/**
 * Top Reviewers — identifies reviewers who have left the most reviews
 * across all monitored competitors. Shows the top 10 reviewers by review
 * count, with their avg rating, number of competitors they reviewed, and
 * number of branches they covered.
 *
 * This is a "cross-competitor reviewer analysis" — useful for spotting
 * power users or potentially suspicious review patterns (e.g. one person
 * reviewing all competitors).
 *
 * Self-fetches from /api/reviews (page 1, max pageSize) on mount + when
 * refreshKey changes. Groups by cleaned reviewer name.
 */
export function TopReviewers({ refreshKey }: TopReviewersProps) {
  const [reviews, setReviews] = React.useState<Review[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchReviews = React.useCallback(async () => {
    try {
      setError(null);
      const params = new URLSearchParams({
        page: "1",
        pageSize: "100",
      });
      const res = await fetch(`/api/reviews?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setReviews(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    setLoading(true);
    fetchReviews();
  }, [fetchReviews, refreshKey]);

  const reviewers = React.useMemo(() => {
    const byName = new Map<string, ReviewerEntry>();
    for (const r of reviews) {
      const name = cleanReviewerName(r.reviewer_name);
      if (!name) continue; // skip anonymous
      const existing = byName.get(name) ?? {
        name,
        reviewCount: 0,
        avgRating: 0,
        ratingSum: 0,
        ratingCount: 0,
        competitors: new Set<string>(),
        branches: new Set<string>(),
        latestDate: null as string | null,
        reviewIds: [] as string[],
      };
      existing.reviewCount++;
      if (r.rating !== null) {
        existing.ratingSum += r.rating;
        existing.ratingCount++;
      }
      if (r.competitor_id) existing.competitors.add(r.competitor_id);
      if (r.branch_id) existing.branches.add(r.branch_id);
      if (r.relative_date) {
        // Keep the latest relative_date (rough — we don't have absolute dates per review)
        if (!existing.latestDate) existing.latestDate = r.relative_date;
      }
      existing.reviewIds.push(r.review_id);
      byName.set(name, existing);
    }
    return Array.from(byName.values())
      .map((e) => ({
        ...e,
        avgRating:
          e.ratingCount > 0
            ? Math.round((e.ratingSum / e.ratingCount) * 10) / 10
            : 0,
      }))
      .sort((a, b) => b.reviewCount - a.reviewCount)
      .slice(0, 10);
  }, [reviews]);

  const maxCount = reviewers.length > 0 ? reviewers[0].reviewCount : 0;
  const crossCompetitorReviewers = reviewers.filter(
    (r) => r.competitors.size > 1,
  ).length;

  if (loading && reviews.length === 0) {
    return (
      <Card className="gbp-card-hover">
        <CardHeader>
          <Skeleton className="h-5 w-36" />
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 rounded-md" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="gbp-card-hover">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4 text-primary" aria-hidden="true" />
            Top Reviewers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={RefreshCw}
            title="Couldn't load reviewers"
            description={error}
            className="h-[160px]"
          />
        </CardContent>
      </Card>
    );
  }

  if (reviewers.length === 0) {
    return (
      <Card className="gbp-card-hover">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4 text-primary" aria-hidden="true" />
            Top Reviewers
          </CardTitle>
          <CardDescription>
            Reviewers with the most reviews across all competitors.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Users}
            title="No reviewers yet"
            description="The list will populate once the scraper collects reviews."
            className="h-[160px]"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gbp-card-hover">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4 text-primary" aria-hidden="true" />
              Top Reviewers
              <Badge
                variant="outline"
                className="ml-1 px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
              >
                {reviewers.length} shown
              </Badge>
            </CardTitle>
            <CardDescription>
              Reviewers with the most reviews across all competitors.
              {crossCompetitorReviewers > 0 && (
                <span className="ml-1 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  · {crossCompetitorReviewers} cross-competitor
                </span>
              )}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchReviews}
            className="text-xs text-muted-foreground hover:text-foreground"
            aria-label="Refresh top reviewers"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ol className="space-y-1.5">
          {reviewers.map((reviewer, idx) => {
            const barWidthPct =
              maxCount > 0 ? (reviewer.reviewCount / maxCount) * 100 : 0;
            const isCrossCompetitor = reviewer.competitors.size > 1;
            return (
              <motion.li
                key={reviewer.name}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: idx * 0.03 }}
                className="space-y-1"
              >
                <div className="flex items-center gap-2 text-xs">
                  {/* Rank */}
                  <span
                    className={
                      "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular-nums " +
                      (idx === 0
                        ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                        : idx === 1
                          ? "bg-muted-foreground/20 text-muted-foreground"
                          : idx === 2
                            ? "bg-orange-700/15 text-orange-700 dark:text-orange-400"
                            : "bg-muted/30 text-muted-foreground")
                    }
                  >
                    {idx + 1}
                  </span>
                  {/* Name */}
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                    {reviewer.name}
                  </span>
                  {/* Avg rating */}
                  {reviewer.avgRating > 0 && (
                    <StarRating
                      rating={reviewer.avgRating}
                      size="sm"
                      showValue
                    />
                  )}
                  {/* Review count */}
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className={
                            "shrink-0 font-bold tabular-nums " +
                            (isCrossCompetitor
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-foreground")
                          }
                        >
                          {reviewer.reviewCount}
                          <span className="ml-0.5 text-[9px] font-normal text-muted-foreground">
                            review{reviewer.reviewCount === 1 ? "" : "s"}
                          </span>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p className="font-semibold">{reviewer.name}</p>
                        <p className="text-xs opacity-90">
                          <span className="font-bold tabular-nums">
                            {reviewer.reviewCount}
                          </span>{" "}
                          review{reviewer.reviewCount === 1 ? "" : "s"} ·{" "}
                          <span className="font-bold tabular-nums">
                            {reviewer.competitors.size}
                          </span>{" "}
                          competitor{reviewer.competitors.size === 1 ? "" : "s"} ·{" "}
                          <span className="font-bold tabular-nums">
                            {reviewer.branches.size}
                          </span>{" "}
                          branch{reviewer.branches.size === 1 ? "" : "es"}
                        </p>
                        {reviewer.latestDate && (
                          <p className="text-[10px] opacity-70">
                            latest: {reviewer.latestDate}
                          </p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                {/* Activity bar + competitor badges */}
                <div className="flex items-center gap-2 pl-7">
                  <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${barWidthPct}%` }}
                      transition={{
                        duration: 0.4,
                        delay: idx * 0.03 + 0.1,
                        ease: "easeOut",
                      }}
                      className={
                        "h-full rounded-full " +
                        (isCrossCompetitor
                          ? "bg-amber-500"
                          : "bg-primary/60")
                      }
                    />
                  </div>
                  {isCrossCompetitor && (
                    <Badge
                      variant="outline"
                      className="shrink-0 border-amber-500/40 bg-amber-500/10 px-1 py-0 text-[9px] font-medium text-amber-700 dark:text-amber-300"
                    >
                      {reviewer.competitors.size} comp
                    </Badge>
                  )}
                </div>
              </motion.li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
