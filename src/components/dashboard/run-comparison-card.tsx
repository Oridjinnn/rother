"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  GitCompareArrows,
  RefreshCw,
  Store,
  TrendingUp,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { EmptyState } from "./empty-state";
import { formatTimestamp } from "@/lib/gbp/format";
import type { HistoryResponse, HistoryRun } from "@/lib/gbp/types";

interface RunComparisonCardProps {
  /** Bump to force a refetch. */
  refreshKey?: number;
}

interface CompetitorDiff {
  competitor_id: string;
  competitor_name: string;
  branch_name: string;
  countA: number; // new reviews in run A (0 if absent)
  countB: number; // new reviews in run B (0 if absent)
  delta: number; // countB - countA
}

/**
 * Scraper Run Comparison — lets the user pick two runs from the history
 * and compare them side-by-side. Shows the total new reviews for each run,
 * the delta between them, and a per-competitor breakdown table highlighting
 * which competitors gained/lost new reviews between the two runs.
 *
 * Self-fetches from /api/history on mount + when refreshKey changes.
 * Falls back to an empty state when fewer than 2 runs exist (can't compare).
 */
export function RunComparisonCard({ refreshKey }: RunComparisonCardProps) {
  const [data, setData] = React.useState<HistoryResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [runIdA, setRunIdA] = React.useState<string>("");
  const [runIdB, setRunIdB] = React.useState<string>("");
  // Refs to read the current selection inside fetchData without making it
  // a dependency (we don't want to re-fetch when the user changes dropdowns).
  const runIdARef = React.useRef(runIdA);
  const runIdBRef = React.useRef(runIdB);
  runIdARef.current = runIdA;
  runIdBRef.current = runIdB;

  const fetchData = React.useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/history", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `failed (${res.status})`);
      }
      const json: HistoryResponse = await res.json();
      setData(json);
      // Default: compare the two most recent runs (if 2+ exist + nothing selected yet)
      if (json.runs.length >= 2 && !runIdARef.current && !runIdBRef.current) {
        setRunIdA(json.runs[1].run_timestamp); // second-most-recent
        setRunIdB(json.runs[0].run_timestamp); // most recent
      }
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

  const runA = data?.runs.find((r) => r.run_timestamp === runIdA) ?? null;
  const runB = data?.runs.find((r) => r.run_timestamp === runIdB) ?? null;

  // Build the per-competitor diff
  const diffs = React.useMemo<CompetitorDiff[]>(() => {
    if (!runA || !runB) return [];
    const byId = new Map<string, CompetitorDiff>();
    for (const b of runA.breakdown) {
      byId.set(b.competitor_id, {
        competitor_id: b.competitor_id,
        competitor_name: b.competitor_name,
        branch_name: b.branch_name,
        countA: b.count,
        countB: 0,
        delta: 0,
      });
    }
    for (const b of runB.breakdown) {
      const existing = byId.get(b.competitor_id);
      if (existing) {
        existing.countB = b.count;
        existing.delta = b.count - existing.countA;
      } else {
        byId.set(b.competitor_id, {
          competitor_id: b.competitor_id,
          competitor_name: b.competitor_name,
          branch_name: b.branch_name,
          countA: 0,
          countB: b.count,
          delta: b.count,
        });
      }
    }
    return Array.from(byId.values()).sort(
      (a, b) => Math.abs(b.delta) - Math.abs(a.delta),
    );
  }, [runA, runB]);

  const totalDelta = runA && runB ? runB.total_new_reviews - runA.total_new_reviews : 0;

  if (loading && !data) {
    return (
      <Card className="gbp-card-hover">
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-10 rounded-md" />
          <Skeleton className="h-32 rounded-md" />
        </CardContent>
      </Card>
    );
  }

  if (error && !data) {
    return (
      <Card className="gbp-card-hover">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitCompareArrows className="size-4 text-primary" aria-hidden="true" />
            Run Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={RefreshCw}
            title="Couldn't load run history"
            description={error}
            className="h-[200px]"
          />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.runs.length < 2) {
    return (
      <Card className="gbp-card-hover">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitCompareArrows className="size-4 text-primary" aria-hidden="true" />
            Run Comparison
          </CardTitle>
          <CardDescription>
            Compare two scraper runs side-by-side to see what changed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={GitCompareArrows}
            title="Need at least 2 runs to compare"
            description="Run the scraper a few more times to build up history, then come back to compare runs."
            className="h-[200px]"
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
              <GitCompareArrows className="size-4 text-primary" aria-hidden="true" />
              Run Comparison
              {runA && runB && (
                <Badge
                  variant="outline"
                  className="ml-1 px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
                >
                  {diffs.length} competitor{diffs.length === 1 ? "" : "s"}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Compare two scraper runs to see what changed between them.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchData}
            className="text-xs text-muted-foreground hover:text-foreground"
            aria-label="Refresh comparison"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
          </Button>
        </div>

        {/* Run selectors */}
        <div className="mt-2 grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_auto_1fr]">
          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Run A (older)
            </label>
            <Select value={runIdA} onValueChange={setRunIdA}>
              <SelectTrigger size="sm" className="w-full">
                <SelectValue placeholder="Select run A" />
              </SelectTrigger>
              <SelectContent>
                {data.runs.map((r) => (
                  <SelectItem key={r.run_timestamp} value={r.run_timestamp}>
                    {formatTimestamp(r.run_timestamp).relative} · +{r.total_new_reviews}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ArrowRight
            className="hidden size-4 text-muted-foreground sm:block"
            aria-hidden="true"
          />
          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Run B (newer)
            </label>
            <Select value={runIdB} onValueChange={setRunIdB}>
              <SelectTrigger size="sm" className="w-full">
                <SelectValue placeholder="Select run B" />
              </SelectTrigger>
              <SelectContent>
                {data.runs.map((r) => (
                  <SelectItem key={r.run_timestamp} value={r.run_timestamp}>
                    {formatTimestamp(r.run_timestamp).relative} · +{r.total_new_reviews}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {runA && runB ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="space-y-3"
          >
            {/* Summary row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-border/40 bg-muted/20 p-2.5 text-center">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Run A
                </div>
                <div className="text-xl font-bold tabular-nums text-foreground">
                  +{runA.total_new_reviews}
                </div>
                <div className="text-[9px] text-muted-foreground">
                  {runA.competitors_with_new} competitor{runA.competitors_with_new === 1 ? "" : "s"}
                </div>
              </div>
              <div className="rounded-lg border border-border/40 bg-muted/20 p-2.5 text-center">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Run B
                </div>
                <div className="text-xl font-bold tabular-nums text-foreground">
                  +{runB.total_new_reviews}
                </div>
                <div className="text-[9px] text-muted-foreground">
                  {runB.competitors_with_new} competitor{runB.competitors_with_new === 1 ? "" : "s"}
                </div>
              </div>
              <div className="rounded-lg border border-border/40 bg-muted/20 p-2.5 text-center">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Delta
                </div>
                <div
                  className={
                    "text-xl font-bold tabular-nums " +
                    (totalDelta > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : totalDelta < 0
                        ? "text-destructive"
                        : "text-foreground")
                  }
                >
                  {totalDelta > 0 ? "+" : ""}
                  {totalDelta}
                </div>
                <div className="text-[9px] text-muted-foreground">
                  {totalDelta > 0 ? "more" : totalDelta < 0 ? "fewer" : "same"}
                </div>
              </div>
            </div>

            {/* Per-competitor diff table */}
            {diffs.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Per-competitor changes
                </div>
                <div className="max-h-48 space-y-1 overflow-y-auto gbp-scrollbar pr-1">
                  {diffs.map((d) => (
                    <div
                      key={d.competitor_id}
                      className="flex items-center gap-2 rounded-md border border-border/40 bg-muted/20 px-2.5 py-1.5"
                    >
                      <Store
                        className="size-3 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium text-foreground">
                          {d.competitor_name}
                        </div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {d.branch_name.replace(/^Copenhagen Bali\s*-\s*/i, "").trim()}
                        </div>
                      </div>
                      {/* Count A → Count B with delta */}
                      <div className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums">
                        <span className="text-muted-foreground">+{d.countA}</span>
                        <ArrowRight
                          className="size-2.5 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span className="font-medium text-foreground">+{d.countB}</span>
                        <Badge
                          variant="outline"
                          className={
                            "ml-1 px-1.5 py-0 text-[10px] font-semibold " +
                            (d.delta > 0
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : d.delta < 0
                                ? "border-destructive/40 bg-destructive/10 text-destructive"
                                : "border-border text-muted-foreground")
                          }
                        >
                          {d.delta > 0 ? "+" : ""}
                          {d.delta}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          <EmptyState
            icon={GitCompareArrows}
            title="Select two runs to compare"
            description="Choose a Run A and Run B from the dropdowns above."
            className="h-[160px]"
          />
        )}
      </CardContent>
    </Card>
  );
}
