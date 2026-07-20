"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  ExternalLink,
  MapPin,
  MessageSquare,
  Star,
  Store,
  TrendingUp,
  Users,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { StarRating } from "./star-rating";
import { EmptyState } from "./empty-state";
import { CompetitorDetailDialog } from "./competitor-detail-dialog";
import { FreshnessBadge } from "./freshness-badge";
import { formatTimestamp } from "@/lib/gbp/format";
import type { BranchesResponse, BranchWithStats, CompetitorStats } from "@/lib/gbp/types";

interface BranchComparisonSectionProps {
  data: BranchesResponse | null;
  loading: boolean;
  error: string | null;
}

/**
 * Branch Comparison tab: a side-by-side grid of all 6 Copenhagen Bali
 * branches, each card showing the branch's aggregate stats (total reviews,
 * avg rating, new reviews) + its 2 competitors in a compact list.
 *
 * Unlike the Branches tab (which is an accordion for deep-dive), this view
 * is designed for at-a-glance comparison across all branches simultaneously.
 * Cards are laid out in a responsive grid (1 col mobile, 2 col tablet,
 * 3 col desktop) so all 6 branches fit on one screen.
 */
export function BranchComparisonSection({
  data,
  loading,
  error,
}: BranchComparisonSectionProps) {
  const [selectedCompetitor, setSelectedCompetitor] =
    React.useState<CompetitorStats | null>(null);

  if (loading && !data) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-72 rounded-xl" />
        ))}
      </div>
    );
  }

  if (error && !data) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Couldn't load branch comparison"
        description={error}
      />
    );
  }

  if (!data || data.branches.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="space-y-4"
    >
      {/* Summary header */}
      <Card className="gbp-card-hover bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="size-4 text-primary" aria-hidden="true" />
            Branch Comparison
          </CardTitle>
          <CardDescription>
            Side-by-side comparison of all {data.branches.length} Copenhagen Bali
            branches · {data.totalCompetitors} competitors ·{" "}
            {data.totalReviews} reviews monitored. Sorted by total reviews
            (descending).
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Branch cards grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...data.branches]
          .sort((a, b) => b.total_reviews - a.total_reviews)
          .map((branch, idx) => (
            <BranchComparisonCard
              key={branch.branch_id}
              branch={branch}
              rank={idx + 1}
              onSelectCompetitor={setSelectedCompetitor}
            />
          ))}
      </div>

      {/* Competitor detail dialog — opens when a competitor card is clicked */}
      <CompetitorDetailDialog
        competitor={selectedCompetitor}
        onOpenChange={(open) => {
          if (!open) setSelectedCompetitor(null);
        }}
      />
    </motion.div>
  );
}

function BranchComparisonCard({
  branch,
  rank,
  onSelectCompetitor,
}: {
  branch: BranchWithStats;
  rank: number;
  onSelectCompetitor: (c: CompetitorStats) => void;
}) {
  const shortName = branch.branch_name.replace(/^Copenhagen Bali\s*-\s*/i, "").trim();
  const competitorsWithReviews = branch.competitors.filter(
    (c) => c.total_reviews > 0,
  );
  const avgRating =
    competitorsWithReviews.length > 0
      ? competitorsWithReviews.reduce((s, c) => s + (c.average_rating ?? 0), 0) /
        competitorsWithReviews.length
      : null;
  const lastScraped = branch.competitors
    .map((c) => c.last_scraped_at)
    .filter(Boolean)
    .sort()
    .reverse()[0];

  const rankBadge =
    rank === 1
      ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : rank === 2
        ? "border-muted-foreground/40 bg-muted/40 text-muted-foreground"
        : "border-border bg-muted/20 text-muted-foreground";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: rank * 0.05 }}
    >
      <Card className="gbp-card-hover relative h-full overflow-hidden">
        {/* Rank badge in top-right */}
        <div className="absolute right-3 top-3 z-10">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={
                    "inline-flex h-7 min-w-7 items-center justify-center rounded-full border px-2 text-xs font-bold tabular-nums " +
                    rankBadge
                  }
                  aria-label={`Rank ${rank} by total reviews`}
                >
                  #{rank}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Rank {rank} of 6 by total reviews
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <CardHeader className="pb-3">
          <div className="flex items-start gap-2">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 text-primary">
              <MapPin className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 pr-8">
              <CardTitle className="truncate text-base">{shortName}</CardTitle>
              <CardDescription className="font-mono text-[10px]">
                {branch.branch_id}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Aggregate stats row */}
          <div className="grid grid-cols-3 gap-2">
            <StatPill
              icon={MessageSquare}
              label="Reviews"
              value={branch.total_reviews.toString()}
              accent="text-foreground"
            />
            <StatPill
              icon={Star}
              label="Avg"
              value={avgRating ? avgRating.toFixed(1) : "—"}
              accent="text-amber-600 dark:text-amber-400"
            />
            <StatPill
              icon={TrendingUp}
              label="New"
              value={branch.new_reviews_count > 0 ? `+${branch.new_reviews_count}` : "0"}
              accent={
                branch.new_reviews_count > 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-muted-foreground"
              }
            />
          </div>

          <Separator />

          {/* Competitors list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Store className="size-3" aria-hidden="true" />
                Competitors
              </span>
              <span className="text-[10px] text-muted-foreground">
                {competitorsWithReviews.length}/{branch.competitors.length} with data
              </span>
            </div>
            {branch.competitors.map((comp) => (
              <button
                type="button"
                key={comp.competitor_id}
                onClick={() => onSelectCompetitor(comp)}
                className="w-full cursor-pointer rounded-md border border-border/40 bg-muted/20 p-2.5 text-left transition-colors hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                aria-label={`View details for ${comp.name}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-foreground">
                      {comp.name}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {comp.competitor_id}
                    </div>
                  </div>
                  {comp.total_reviews > 0 ? (
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StarRating rating={comp.average_rating} size="sm" />
                      <FreshnessBadge lastScrapedAt={comp.last_scraped_at} />
                    </div>
                  ) : (
                    <Badge
                      variant="outline"
                      className="shrink-0 px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
                    >
                      no data
                    </Badge>
                  )}
                </div>
                {comp.total_reviews > 0 && (
                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-2.5" aria-hidden="true" />
                      {comp.total_reviews} review{comp.total_reviews === 1 ? "" : "s"}
                    </span>
                    {comp.new_reviews_count > 0 && (
                      <span className="inline-flex items-center gap-0.5 font-semibold text-emerald-600 dark:text-emerald-400">
                        <TrendingUp className="size-2.5" aria-hidden="true" />
                        +{comp.new_reviews_count}
                      </span>
                    )}
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Last updated footer */}
          {lastScraped && (
            <div className="flex items-center gap-1.5 border-t border-border/40 pt-2 text-[10px] text-muted-foreground">
              <CalendarClock className="size-3" aria-hidden="true" />
              <span>Last updated: {formatTimestamp(lastScraped).relative}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function StatPill({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Star;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/20 p-2 text-center">
      <Icon className="mx-auto mb-0.5 size-3 text-muted-foreground" aria-hidden="true" />
      <div className={"text-base font-bold tabular-nums " + accent}>{value}</div>
      <div className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
