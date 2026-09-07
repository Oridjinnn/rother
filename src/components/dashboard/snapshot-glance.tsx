"use client";

import * as React from "react";
import { AlertTriangle, FileText } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StarRating } from "./star-rating";
import { FreshnessBadge } from "./freshness-badge";
import { EmptyState } from "./empty-state";
import { useOverview } from "@/lib/gbp/use-overview";

/**
 * "Snapshot at a Glance" — per-competitor review counts + average ratings.
 * Extracted from overview-section so it can be its own feature page.
 * Self-fetches /api/overview.
 */
export function SnapshotGlance() {
  const { data, loading, error } = useOverview();

  if (loading && !data) {
    return <div className="h-40 animate-pulse rounded-xl bg-muted/40" />;
  }
  if (error && !data) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Couldn't load snapshot"
        description={error}
      />
    );
  }

  const stats = data?.competitorStats.filter((c) => c.total_reviews > 0) ?? [];

  return (
    <Card className="gbp-card-hover">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4 text-primary" />
          Snapshot at a Glance
        </CardTitle>
        <CardDescription>
          Per-competitor review counts and average ratings.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* D4 / TD-H06: surface a non-blocking notice when the last scrape run
            failed or produced no summary, so an empty dashboard is not mistaken
            for "healthy". The data layer now also logs these failures server-side. */}
        {(() => {
          const summary = data?.runSummary;
          const failed = summary?.failed ?? 0;
          const noSummaryButActive =
            !summary && stats.length === 0;
          const dataStatus = data?.dataStatus;
          if (dataStatus === "corrupt") {
            return (
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-800 dark:text-red-200">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  A data file failed to parse (corrupt JSON). Recent scrapes may
                  not appear. Check the run log for details.
                </span>
              </div>
            );
          }
          if (dataStatus === "missing") {
            return (
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  No baseline data found yet. Run a scrape to populate snapshots
                  and deltas.
                </span>
              </div>
            );
          }
          if (failed > 0) {
            return (
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  The last scrape run reported {failed} failed{" "}
                  {failed === 1 ? "competitor" : "competitors"}. Some data may be
                  missing or out of date.
                </span>
              </div>
            );
          }
          if (noSummaryButActive) {
            return (
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  No scrape summary found. If you just ran a scan, it may have
                  failed before writing data.
                </span>
              </div>
            );
          }
          return null;
        })()}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {stats.map((c) => (
            <div
              key={c.competitor_id}
              className="rounded-lg border border-border/60 bg-muted/30 p-3 transition-colors hover:border-primary/30 hover:bg-primary/5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {c.name}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {c.branch_name}
                  </div>
                </div>
                {c.new_reviews_count > 0 && (
                  <Badge
                    className="shrink-0 gap-1 border-amber-500/40 bg-amber-500/15 px-1.5 py-0 text-[10px] font-semibold text-amber-700 dark:text-amber-300"
                    variant="outline"
                  >
                    +{c.new_reviews_count}
                  </Badge>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <StarRating rating={c.average_rating} size="sm" />
                <FreshnessBadge lastScrapedAt={c.last_scraped_at} />
                <span className="ml-auto text-xs font-medium tabular-nums text-muted-foreground">
                  {c.total_reviews} review{c.total_reviews === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          ))}
          {stats.length === 0 && (
            <div className="col-span-full py-6 text-center text-sm text-muted-foreground">
              No competitors have reviews yet.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
