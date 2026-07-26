"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeftRight,
  Plus,
  RefreshCw,
  Star,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


import { EmptyState } from "./empty-state";
import { StarRating } from "./star-rating";

import type {
  BranchesResponse,
  BranchWithStats,
  HistoricalComparisonResponse,
} from "@/lib/gbp/types";

interface HistoryComparisonSectionProps {
  refreshKey?: number;
}

export function HistoryComparisonSection({ refreshKey }: HistoryComparisonSectionProps) {
  const [branches, setBranches] = React.useState<BranchesResponse | null>(null);
  const [competitorId, setCompetitorId] = React.useState<string>("");
  const [comparison, setComparison] = React.useState<HistoricalComparisonResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/branches")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<BranchesResponse>;
      })
      .then(setBranches)
      .catch(() => {});
  }, [refreshKey]);

  const competitorOptions = React.useMemo(() => {
    if (!branches) return [];
    return branches.branches.flatMap((b: BranchWithStats) =>
      b.competitors.map((c) => ({
        competitor_id: c.competitor_id,
        name: c.name,
        branch_name: b.branch_name,
      })),
    );
  }, [branches]);

  const fetchComparison = React.useCallback(async () => {
    if (!competitorId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/history/compare?competitor_id=${encodeURIComponent(competitorId)}`, {
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = (await r.json()) as HistoricalComparisonResponse;
      setComparison(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setComparison(null);
    } finally {
      setLoading(false);
    }
  }, [competitorId]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="space-y-4"
    >
      <Card className="gbp-card-hover bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1 min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <ArrowLeftRight className="size-4 text-primary" />
                Historical Comparison
              </CardTitle>
              <CardDescription>
                Compare current snapshot with historical data for a competitor.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1 min-w-[250px]">
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Competitor
              </label>
              <Select value={competitorId} onValueChange={setCompetitorId}>
                <SelectTrigger className="w-full h-8 text-xs">
                  <SelectValue placeholder="Select a competitor..." />
                </SelectTrigger>
                <SelectContent>
                  {competitorOptions.map((c) => (
                    <SelectItem key={c.competitor_id} value={c.competitor_id}>
                      {c.name} · {c.branch_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={fetchComparison}
              disabled={!competitorId || loading}
              className="gap-1.5"
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              Compare
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ) : error ? (
        <EmptyState icon={AlertTriangle} title="Comparison failed" description={error} />
      ) : !comparison ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="Select a competitor"
          description="Choose a competitor above and click Compare to see changes over time."
        />
      ) : (
        <div className="space-y-4">
          <Card className="gbp-card-hover">
            <CardHeader>
              <CardTitle className="text-base">
                {comparison.competitor_name}
              </CardTitle>
              <CardDescription>
                {comparison.branch_name} · {comparison.competitor_id}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-center">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Current
                  </div>
                  <div className="text-2xl font-bold tabular-nums">
                    {comparison.newer_count}
                  </div>
                  <div className="text-[10px] text-muted-foreground">reviews</div>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-center">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Previous
                  </div>
                  <div className="text-2xl font-bold tabular-nums text-muted-foreground">
                    {comparison.older_count}
                  </div>
                  <div className="text-[10px] text-muted-foreground">reviews</div>
                </div>
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-center">
                  <div className="text-[10px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                    Added
                  </div>
                  <div className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    +{comparison.new_in_newer.length}
                  </div>
                  <div className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70">new reviews</div>
                </div>
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-center">
                  <div className="text-[10px] uppercase tracking-wide text-red-600 dark:text-red-400">
                    Removed
                  </div>
                  <div className="text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">
                    -{comparison.removed_from_newer.length}
                  </div>
                  <div className="text-[10px] text-red-600/70 dark:text-red-400/70">removed</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {comparison.new_in_newer.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-emerald-600 dark:text-emerald-400">
                  <Plus className="size-4" />
                  New Reviews ({comparison.new_in_newer.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {comparison.new_in_newer.length} review(s) appeared in the current snapshot that
                  weren&apos;t in the previous data.
                </p>
              </CardContent>
            </Card>
          )}

          {comparison.rating_changed.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-amber-600 dark:text-amber-400">
                  <Star className="size-4" />
                  Rating Changes ({comparison.rating_changed.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {comparison.rating_changed.map((rc) => (
                    <div
                      key={rc.review_id}
                      className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 p-3"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">was</span>
                        <StarRating rating={rc.old_rating} size="sm" />
                      </div>
                      <ArrowRight className="size-4 text-muted-foreground" />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">now</span>
                        <StarRating rating={rc.new_rating} size="sm" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </motion.div>
  );
}

function ArrowRight({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}
