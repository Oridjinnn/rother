"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Clock,
  Download,
  FileJson,
  FileSpreadsheet,
  GitCommitVertical,
  Loader2,
  MapPin,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

import { formatTimestamp } from "@/lib/gbp/format";
import type { HistoryResponse, HistoryRun } from "@/lib/gbp/types";
import { EmptyState } from "./empty-state";

interface RunHistoryTimelineProps {
  /** Bump to force a refetch. */
  refreshKey?: number;
}

const POLL_MS = 30_000; // 30s — less aggressive than the logs tail

/**
 * Run History timeline: a vertical timeline of every scraper run that
 * produced new reviews, newest first. Each entry shows the run timestamp,
 * total new reviews, branches affected, and a per-competitor breakdown.
 *
 * Polls /api/history every 30s so the timeline updates live during a
 * long-running scrape (or after a manual Run Now click).
 *
 * Falls back to an empty state if no runs have produced deltas yet.
 */
/** Compact CSV/JSON export dropdown for the run history timeline. */
function HistoryExportButton({ totalRuns }: { totalRuns: number }) {
  const [isExporting, setIsExporting] = React.useState<"csv" | "json" | null>(
    null,
  );
  const doExport = async (format: "csv" | "json") => {
    if (totalRuns === 0) {
      toast.info("Nothing to export", {
        description: "No updates have found new reviews yet.",
      });
      return;
    }
    setIsExporting(format);
    try {
      const res = await fetch(`/api/history/export?format=${format}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `export failed (${res.status})`);
      }
      const cd = res.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename="?([^";]+)"?/);
      const filename = m?.[1] || `gbp-history.${format}`;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`${format.toUpperCase()} export ready`, {
        description: `${totalRuns} run${totalRuns === 1 ? "" : "s"} → ${filename}`,
      });
    } catch (err) {
      toast.error("Export failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsExporting(null);
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={isExporting !== null || totalRuns === 0}
          className="text-xs text-muted-foreground hover:text-foreground"
          aria-label="Export run history"
        >
          {isExporting !== null ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="size-3.5" aria-hidden="true" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Export {totalRuns} run{totalRuns === 1 ? "" : "s"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => doExport("csv")}
          className="gap-2 cursor-pointer"
        >
          <FileSpreadsheet
            className="size-4 text-emerald-600 dark:text-emerald-400"
            aria-hidden="true"
          />
          <div className="flex flex-col">
            <span className="text-sm font-medium">CSV</span>
            <span className="text-[10px] text-muted-foreground">
              One row per run × competitor
            </span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => doExport("json")}
          className="gap-2 cursor-pointer"
        >
          <FileJson
            className="size-4 text-teal-600 dark:text-teal-400"
            aria-hidden="true"
          />
          <div className="flex flex-col">
            <span className="text-sm font-medium">JSON</span>
            <span className="text-[10px] text-muted-foreground">
              Nested runs with breakdown
            </span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RunHistoryTimeline({ refreshKey }: RunHistoryTimelineProps) {
  const [data, setData] = React.useState<HistoryResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchHistory = React.useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/history", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `history failed (${res.status})`);
      }
      const json: HistoryResponse = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    setLoading(true);
    fetchHistory();
  }, [fetchHistory, refreshKey]);

  // Auto-poll every POLL_MS
  React.useEffect(() => {
    const id = setInterval(fetchHistory, POLL_MS);
    return () => clearInterval(id);
  }, [fetchHistory]);

  if (loading && !data) {
    return (
      <Card className="gbp-card-hover">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitCommitVertical
              className="size-4 text-primary"
              aria-hidden="true"
            />
            Run History
          </CardTitle>
          <CardDescription>Timeline of recent updates</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error && !data) {
    return (
      <Card className="gbp-card-hover">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitCommitVertical
              className="size-4 text-primary"
              aria-hidden="true"
            />
            Run History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={RefreshCw}
            title="Couldn't load run history"
            description={error}
          />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.runs.length === 0) {
    return (
      <Card className="gbp-card-hover">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitCommitVertical
              className="size-4 text-primary"
              aria-hidden="true"
            />
            Run History
          </CardTitle>
          <CardDescription>Timeline of recent updates</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={GitCommitVertical}
            title="No runs with new reviews yet"
            description="Once an update finds new reviews, it will appear here as a timeline entry. Run a few updates to populate this."
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
              <GitCommitVertical
                className="size-4 text-primary"
                aria-hidden="true"
              />
              Run History
              <Badge
                variant="outline"
                className="ml-1 px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
              >
                {data.totalRuns} run{data.totalRuns === 1 ? "" : "s"}
              </Badge>
            </CardTitle>
            <CardDescription>
              Timeline of updates that found new reviews · auto-refresh
              every 30s
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <HistoryExportButton totalRuns={data.totalRuns} />
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchHistory}
              className="text-xs text-muted-foreground hover:text-foreground"
              aria-label="Refresh run history"
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ol className="relative space-y-1">
          {/* Vertical line */}
          <span
            className="absolute left-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-primary/40 via-border to-transparent"
            aria-hidden="true"
          />
          {data.runs.map((run, idx) => (
            <RunHistoryEntry key={run.run_timestamp} run={run} newest={idx === 0} />
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function RunHistoryEntry({ run, newest }: { run: HistoryRun; newest: boolean }) {
  const ts = formatTimestamp(run.run_timestamp);
  return (
    <motion.li
      initial={newest ? { opacity: 0, x: -8 } : false}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="relative pl-7 pr-1 py-3"
    >
      {/* Timeline dot */}
      <span
        className={
          "absolute left-0 top-4 flex size-3.5 items-center justify-center rounded-full ring-2 ring-background " +
          (newest
            ? "bg-primary shadow-[0_0_0_3px_var(--primary)/20]"
            : "bg-muted-foreground/40")
        }
        aria-hidden="true"
      >
        {newest && (
          <span className="size-1.5 rounded-full bg-primary-foreground" />
        )}
      </span>

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-foreground">
          <TrendingUp
            className="size-3.5 text-amber-600 dark:text-amber-400"
            aria-hidden="true"
          />
          +{run.total_new_reviews} new review
          {run.total_new_reviews === 1 ? "" : "s"}
        </span>
        <Badge
          variant="outline"
          className="px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
        >
          {run.competitors_with_new} competitor
          {run.competitors_with_new === 1 ? "" : "s"}
        </Badge>
        <span className="text-xs text-muted-foreground">
          <Clock className="inline size-3 mr-1" aria-hidden="true" />
          {ts.relative}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground/70">
          {ts.absolute}
        </span>
      </div>

      {/* Branches affected */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <MapPin
          className="size-3 text-muted-foreground/70"
          aria-hidden="true"
        />
        {run.branches_affected.slice(0, 4).map((bid) => (
          <span
            key={bid}
            className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
          >
            {bid.replace(/^cph-/, "")}
          </span>
        ))}
        {run.branches_affected.length > 4 && (
          <span className="text-[10px] text-muted-foreground">
            +{run.branches_affected.length - 4} more
          </span>
        )}
      </div>

      {/* Per-competitor breakdown (collapsible-ish — show top 3 inline) */}
      <div className="mt-2 space-y-1">
        {run.breakdown.slice(0, 3).map((b) => (
          <div
            key={b.competitor_id}
            className="flex items-center justify-between gap-2 rounded-md border border-border/40 bg-muted/20 px-2 py-1"
          >
            <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-foreground/80">
              <Store
                className="size-3 shrink-0 text-muted-foreground/70"
                aria-hidden="true"
              />
              <span className="truncate">{b.competitor_name}</span>
            </span>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-amber-700 dark:text-amber-300">
              +{b.count}
            </span>
          </div>
        ))}
        {run.breakdown.length > 3 && (
          <div className="text-[10px] text-muted-foreground pl-1">
            +{run.breakdown.length - 3} more competitor
            {run.breakdown.length - 3 === 1 ? "" : "s"} with new reviews
          </div>
        )}
      </div>
    </motion.li>
  );
}
