"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Gauge } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { EmptyState } from "./empty-state";
import type { CompetitorStats } from "@/lib/gbp/types";

interface CompetitorGrowthRateProps {
  data: CompetitorStats[] | null;
  loading: boolean;
}

interface GrowthEntry {
  competitor_id: string;
  name: string;
  branch_name: string;
  total_reviews: number;
  new_reviews_count: number;
  last_scraped_at: string | null;
  /** Days since the first scrape (using last_scraped_at as a proxy — we
   * don't track first_scrape separately, so this is "days since the most
   * recent scrape" which approximates the monitoring period). */
  days_monitored: number;
  /** Reviews per day = total_reviews / days_monitored. 0 if no data. */
  reviews_per_day: number;
  /** Growth rate category for color coding. */
  level: "high" | "medium" | "low" | "none";
}

function computeGrowth(comp: CompetitorStats): GrowthEntry | null {
  if (comp.total_reviews === 0) return null;
  const lastScraped = comp.last_scraped_at
    ? new Date(comp.last_scraped_at).getTime()
    : null;
  // Use a fallback of 1 day if we can't parse the timestamp — avoids div-by-zero.
  const daysMonitored =
    lastScraped && !Number.isNaN(lastScraped)
      ? Math.max(1, (Date.now() - lastScraped) / (1000 * 60 * 60 * 24))
      : 1;
  const reviewsPerDay = comp.total_reviews / daysMonitored;
  let level: GrowthEntry["level"];
  if (reviewsPerDay >= 5) level = "high";
  else if (reviewsPerDay >= 1) level = "medium";
  else if (reviewsPerDay > 0) level = "low";
  else level = "none";
  return {
    competitor_id: comp.competitor_id,
    name: comp.name,
    branch_name: comp.branch_name,
    total_reviews: comp.total_reviews,
    new_reviews_count: comp.new_reviews_count,
    last_scraped_at: comp.last_scraped_at,
    days_monitored: Math.round(daysMonitored * 10) / 10,
    reviews_per_day: Math.round(reviewsPerDay * 100) / 100,
    level,
  };
}

const LEVEL_STYLES: Record<
  GrowthEntry["level"],
  { barClass: string; textClass: string; label: string }
> = {
  high: {
    barClass: "bg-emerald-500",
    textClass: "text-emerald-700 dark:text-emerald-400",
    label: "High",
  },
  medium: {
    barClass: "bg-amber-500",
    textClass: "text-amber-700 dark:text-amber-400",
    label: "Medium",
  },
  low: {
    barClass: "bg-orange-500/70",
    textClass: "text-orange-700 dark:text-orange-400",
    label: "Low",
  },
  none: {
    barClass: "bg-muted-foreground/30",
    textClass: "text-muted-foreground",
    label: "None",
  },
};

/**
 * Competitor Growth Rate — a horizontal bar chart (custom-rendered, not
 * recharts) showing each competitor's reviews-per-day growth rate. Sorted
 * descending. Each row shows: competitor name, reviews/day value, a
 * proportional colored bar, and the days-monitored context.
 *
 * Uses the existing `competitorStats` data (no new API needed). The growth
 * rate is computed client-side: total_reviews / days_since_last_scrape.
 *
 * This is a heuristic — the "days monitored" is approximate (we use the
 * last scrape timestamp as a proxy for the monitoring period). For a more
 * accurate rate, the Python scraper would need to track the first scrape
 * date per competitor.
 */
export function CompetitorGrowthRate({
  data,
  loading,
}: CompetitorGrowthRateProps) {
  const entries = React.useMemo(() => {
    if (!data) return [];
    return data
      .map(computeGrowth)
      .filter((e): e is GrowthEntry => e !== null)
      .sort((a, b) => b.reviews_per_day - a.reviews_per_day);
  }, [data]);

  const maxRate = entries.length > 0 ? entries[0].reviews_per_day : 0;

  if (loading && !data) {
    return (
      <Card className="gbp-card-hover">
        <CardHeader>
          <Skeleton className="h-5 w-44" />
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 rounded-md" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!data || entries.length === 0) {
    return (
      <Card className="gbp-card-hover">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="size-4 text-primary" aria-hidden="true" />
            Competitor Growth Rate
          </CardTitle>
          <CardDescription>Reviews per day</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Gauge}
            title="No growth data yet"
            description="Run the scraper to calculate growth rates."
            className="h-[160px]"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gbp-card-hover">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="size-4 text-primary" aria-hidden="true" />
          Competitor Growth Rate
          <Badge
            variant="outline"
            className="ml-1 px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
          >
            {entries.length} competitor{entries.length === 1 ? "" : "s"}
          </Badge>
        </CardTitle>
        <CardDescription>
          Reviews per day — higher = faster review accumulation.
          Approximate.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="space-y-2">
          {entries.map((entry, idx) => {
            const style = LEVEL_STYLES[entry.level];
            const barWidthPct =
              maxRate > 0 ? (entry.reviews_per_day / maxRate) * 100 : 0;
            const shortBranch = entry.branch_name.replace(
              /^Copenhagen Bali\s*-\s*/i,
              "",
            ).trim();
            return (
              <motion.li
                key={entry.competitor_id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: idx * 0.04 }}
                className="space-y-1"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-medium text-foreground">
                      {entry.name}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      · {shortBranch}
                    </span>
                  </div>
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className={
                            "shrink-0 font-bold tabular-nums " + style.textClass
                          }
                        >
                          {entry.reviews_per_day.toFixed(2)}
                          <span className="ml-0.5 text-[9px] font-normal text-muted-foreground">
                            /day
                          </span>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p className="font-semibold">{entry.name}</p>
                        <p className="text-xs opacity-90">
                          <span className="font-bold tabular-nums">
                            {entry.total_reviews}
                          </span>{" "}
                          total reviews ·{" "}
                          <span className="font-bold tabular-nums">
                            {entry.days_monitored}
                          </span>{" "}
                          days monitored
                        </p>
                        {entry.new_reviews_count > 0 && (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400">
                            +{entry.new_reviews_count} new in last run
                          </p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                {/* Growth bar */}
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${barWidthPct}%` }}
                    transition={{
                      duration: 0.5,
                      delay: idx * 0.04 + 0.1,
                      ease: "easeOut",
                    }}
                    className={"h-full rounded-full " + style.barClass}
                  />
                </div>
              </motion.li>
            );
          })}
        </ul>
        {/* Legend */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/40 pt-2 text-[10px] text-muted-foreground">
          {(["high", "medium", "low"] as const).map((lvl) => (
            <span key={lvl} className="inline-flex items-center gap-1">
              <span
                className={"size-2 rounded-sm " + LEVEL_STYLES[lvl].barClass}
                aria-hidden="true"
              />
              {LEVEL_STYLES[lvl].label}:{" "}
              {lvl === "high" ? "≥5/day" : lvl === "medium" ? "1–5/day" : "<1/day"}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
