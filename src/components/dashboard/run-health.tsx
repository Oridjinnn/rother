"use client";

import * as React from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock, XCircle } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "./empty-state";
import { useOverview } from "@/lib/gbp/use-overview";
import { formatTimestamp } from "@/lib/gbp/format";

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

/**
 * "Last Run Health" card — extracted from overview-section so it can be its own
 * single-purpose feature page. Self-fetches /api/overview.
 */
export function RunHealthCard() {
  const { data, loading, error } = useOverview();

  if (loading && !data) {
    return <div className="h-40 animate-pulse rounded-xl bg-muted/40" />;
  }
  if (error && !data) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Couldn't load run health"
        description={error}
      />
    );
  }
  if (!data?.runSummary) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="size-4 text-primary" />
            Last Run Health
          </CardTitle>
          <CardDescription>No updates yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const rs = data.runSummary;
  const total = rs.success + rs.failed + rs.skipped;
  const pct = (n: number) => (total === 0 ? 0 : (n / total) * 100);
  const ts = formatTimestamp(rs.finished_at ?? rs.started_at);

  return (
    <Card className="gbp-card-hover">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <Activity className="size-4 text-primary" />
              Last Run Health
              {rs.failed > 0 ? (
                <Badge
                  variant="outline"
                  className="gap-1 border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300"
                >
                  <AlertTriangle className="size-3" />
                  {rs.failed} failed
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="gap-1 border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300"
                >
                  <CheckCircle2 className="size-3" />
                  Healthy
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" />
                {ts.relative}
              </span>
              <span className="text-border">·</span>
              <span className="font-mono text-[11px]">{ts.absolute}</span>
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div
            className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={`Run health: ${rs.success} success, ${rs.failed} failed, ${rs.skipped} skipped`}
          >
            <div
              className="bg-emerald-500 transition-all duration-500"
              style={{ width: `${pct(rs.success)}%` }}
            />
            <div
              className="bg-destructive transition-all duration-500"
              style={{ width: `${pct(rs.failed)}%` }}
            />
            <div
              className="bg-muted-foreground/40 transition-all duration-500"
              style={{ width: `${pct(rs.skipped)}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
              <span className="size-2 rounded-full bg-emerald-500" />
              <CheckCircle2 className="size-3" />
              <span className="font-semibold tabular-nums">{rs.success}</span>
              <span className="text-muted-foreground">success</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-destructive">
              <span className="size-2 rounded-full bg-destructive" />
              <XCircle className="size-3" />
              <span className="font-semibold tabular-nums">{rs.failed}</span>
              <span className="text-muted-foreground">failed</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-full bg-muted-foreground/40" />
              <span className="font-semibold tabular-nums">{rs.skipped}</span>
              <span>skipped</span>
            </span>
          </div>
        </div>

        {rs.errors.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Errors ({rs.errors.length})
            </h4>
            <div className="gbp-scrollbar max-h-44 space-y-2 overflow-y-auto rounded-md border border-border/60 bg-muted/30 p-2">
              {rs.errors.map((err, i) => (
                <div
                  key={`${err.competitor_id}-${i}`}
                  className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-1.5 font-mono font-semibold text-destructive">
                    <XCircle className="size-3" />
                    {err.competitor_id}
                  </div>
                  <div className="mt-0.5 break-words text-destructive/80">
                    {err.error}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 border-t border-border/60 pt-3 sm:grid-cols-4">
          <Stat label="New reviews" value={`+${rs.new_reviews}`} />
          <Stat label="Total reviews" value={rs.total_reviews} />
          <Stat
            label="Duration"
            value={
              rs.finished_at
                ? `${(
                    new Date(rs.finished_at).getTime() -
                    new Date(rs.started_at).getTime()
                  ).toFixed(0)}ms`
                : "—"
            }
          />
          <Stat label="Listings" value={total} />
        </div>
      </CardContent>
    </Card>
  );
}
