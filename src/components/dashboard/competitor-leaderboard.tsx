"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Trophy,
  TrendingUp,
  Star,
  MessageSquare,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

import { StarRating } from "./star-rating";
import { EmptyState } from "./empty-state";
import type { CompetitorStats } from "@/lib/gbp/types";

interface CompetitorLeaderboardProps {
  data: CompetitorStats[] | null;
  loading: boolean;
}

type SortKey = "average_rating" | "total_reviews" | "new_reviews_count";
type SortDir = "asc" | "desc";

const SORT_OPTIONS: { key: SortKey; label: string; icon: typeof Star }[] = [
  { key: "average_rating", label: "Rating", icon: Star },
  { key: "total_reviews", label: "Reviews", icon: MessageSquare },
  { key: "new_reviews_count", label: "New", icon: TrendingUp },
];

/**
 * Competitor Leaderboard — a compact, sortable ranked list of all
 * competitors. Default sort: average rating (descending). Users can
 * toggle the sort key + direction via the 3 pill buttons.
 *
 * Shows the top 12 competitors (or fewer if there are less). Each row
 * has: rank number, competitor name, branch, star rating, review count,
 * and new-reviews badge. Medal icons for the top 3.
 */
export function CompetitorLeaderboard({
  data,
  loading,
}: CompetitorLeaderboardProps) {
  const [sortKey, setSortKey] = React.useState<SortKey>("average_rating");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");

  const sorted = React.useMemo(() => {
    if (!data) return [];
    const filtered = data.filter((c) => c.total_reviews > 0);
    const sorted = [...filtered].sort((a, b) => {
      let diff = 0;
      if (sortKey === "average_rating") {
        diff = (a.average_rating ?? 0) - (b.average_rating ?? 0);
      } else if (sortKey === "total_reviews") {
        diff = a.total_reviews - b.total_reviews;
      } else {
        diff = a.new_reviews_count - b.new_reviews_count;
      }
      return sortDir === "desc" ? -diff : diff;
    });
    return sorted.slice(0, 12);
  }, [data, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc"); // default to descending when switching keys
    }
  };

  if (loading && !data) {
    return (
      <Card className="gbp-card-hover">
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded-md" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!data || sorted.length === 0) {
    return (
      <Card className="gbp-card-hover">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="size-4 text-primary" aria-hidden="true" />
            Competitor Leaderboard
          </CardTitle>
          <CardDescription>Ranked by selected metric</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Trophy}
            title="No competitor data yet"
            description="Run the scraper to populate the leaderboard."
            className="h-[200px]"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gbp-card-hover">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="size-4 text-primary" aria-hidden="true" />
          Competitor Leaderboard
          <Badge
            variant="outline"
            className="ml-1 px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
          >
            {sorted.length} competitor{sorted.length === 1 ? "" : "s"}
          </Badge>
        </CardTitle>
        <CardDescription>
          Sortable ranking — click a column header to change the metric.
        </CardDescription>

        {/* Sort toggle pills */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SORT_OPTIONS.map((opt) => {
            const isActive = sortKey === opt.key;
            const Icon = opt.icon;
            const DirIcon =
              isActive
                ? sortDir === "desc"
                  ? ArrowDown
                  : ArrowUp
                : ArrowUpDown;
            return (
              <Button
                key={opt.key}
                variant={isActive ? "default" : "outline"}
                size="sm"
                onClick={() => toggleSort(opt.key)}
                className={
                  "h-7 gap-1 px-2 text-xs " +
                  (isActive
                    ? "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary border-primary/30"
                    : "text-muted-foreground hover:text-foreground")
                }
                aria-pressed={isActive}
                aria-label={`Sort by ${opt.label}, ${
                  isActive ? sortDir : "click to enable"
                }`}
              >
                <Icon className="size-3" aria-hidden="true" />
                {opt.label}
                <DirIcon className="size-2.5" aria-hidden="true" />
              </Button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ol className="space-y-1">
          {sorted.map((comp, idx) => (
            <LeaderboardRow
              key={comp.competitor_id}
              comp={comp}
              rank={idx + 1}
              sortKey={sortKey}
            />
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function LeaderboardRow({
  comp,
  rank,
  sortKey,
}: {
  comp: CompetitorStats;
  rank: number;
  sortKey: SortKey;
}) {
  const shortBranch = comp.branch_name.replace(/^Copenhagen Bali\s*-\s*/i, "").trim();
  const medalClass =
    rank === 1
      ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40"
      : rank === 2
        ? "bg-muted-foreground/20 text-muted-foreground border-muted-foreground/40"
        : rank === 3
          ? "bg-orange-700/15 text-orange-700 dark:text-orange-400 border-orange-700/30"
          : "bg-muted/30 text-muted-foreground border-border/40";

  // Highlight value based on the active sort key
  const highlightValue =
    sortKey === "average_rating"
      ? comp.average_rating?.toFixed(1) ?? "—"
      : sortKey === "total_reviews"
        ? String(comp.total_reviews)
        : comp.new_reviews_count > 0
          ? `+${comp.new_reviews_count}`
          : "0";

  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: rank * 0.03 }}
      className="flex items-center gap-2.5 rounded-md border border-border/40 bg-muted/20 px-2.5 py-2 transition-colors hover:border-primary/30 hover:bg-primary/5"
    >
      {/* Rank badge */}
      <span
        className={
          "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold tabular-nums " +
          medalClass
        }
        aria-label={`Rank ${rank}`}
      >
        {rank}
      </span>

      {/* Name + branch */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">
          {comp.name}
        </div>
        <div className="truncate text-[10px] text-muted-foreground">
          {shortBranch}
        </div>
      </div>

      {/* Star rating (compact) */}
      <div className="hidden sm:block">
        <StarRating rating={comp.average_rating} size="sm" showValue={false} />
      </div>

      {/* Highlight value */}
      <div className="flex shrink-0 flex-col items-end">
        <span
          className={
            "text-sm font-bold tabular-nums " +
            (sortKey === "new_reviews_count" && comp.new_reviews_count > 0
              ? "text-emerald-600 dark:text-emerald-400"
              : sortKey === "average_rating"
                ? "text-amber-600 dark:text-amber-400"
                : "text-foreground")
          }
        >
          {highlightValue}
        </span>
        <span className="text-[9px] text-muted-foreground">
          {sortKey === "average_rating"
            ? "avg"
            : sortKey === "total_reviews"
              ? "reviews"
              : "new"}
        </span>
      </div>
    </motion.li>
  );
}
