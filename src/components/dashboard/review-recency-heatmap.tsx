"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { CalendarDays, RefreshCw } from "lucide-react";

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

import { EmptyState } from "./empty-state";
import type { HistoryResponse } from "@/lib/gbp/types";

interface ReviewRecencyHeatmapProps {
  /** Bump to force a refetch. */
  refreshKey?: number;
}

const WEEKS = 13; // ~3 months
const DAYS = WEEKS * 7;

interface DayCell {
  date: Date;
  dateStr: string; // YYYY-MM-DD
  newReviews: number;
  runs: number;
}

function computeLevel(count: number): number {
  if (count === 0) return 0;
  if (count <= 3) return 1;
  if (count <= 7) return 2;
  if (count <= 15) return 3;
  return 4;
}

const LEVEL_COLORS = [
  "bg-muted/40", // 0: no activity
  "bg-emerald-500/30", // 1: 1-3
  "bg-emerald-500/55", // 2: 4-7
  "bg-emerald-500/75", // 3: 8-15
  "bg-emerald-500", // 4: 16+
];

/**
 * Review Recency Heatmap — a GitHub-style contribution graph showing
 * which days had scraper runs that produced new reviews over the last
 * ~3 months (13 weeks). Each cell is a day; color intensity = number
 * of new reviews found that day.
 *
 * Self-fetches from /api/history (reuses the existing delta-file data).
 * The heatmap is read-only — clicking a cell shows a tooltip with the
 * date + review count.
 */
export function ReviewRecencyHeatmap({ refreshKey }: ReviewRecencyHeatmapProps) {
  const [data, setData] = React.useState<HistoryResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

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

  // Build the day cells: last DAYS days ending today.
  const cells = React.useMemo<DayCell[]>(() => {
    const byDate = new Map<string, { newReviews: number; runs: number }>();
    if (data) {
      for (const run of data.runs) {
        const date = run.run_timestamp.slice(0, 10); // YYYY-MM-DD
        const existing = byDate.get(date) ?? { newReviews: 0, runs: 0 };
        existing.newReviews += run.total_new_reviews;
        existing.runs += 1;
        byDate.set(date, existing);
      }
    }
    const out: DayCell[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const info = byDate.get(dateStr);
      out.push({
        date: d,
        dateStr,
        newReviews: info?.newReviews ?? 0,
        runs: info?.runs ?? 0,
      });
    }
    return out;
  }, [data]);

  // Group cells into weeks (columns of 7 days each)
  const weeks = React.useMemo(() => {
    const out: DayCell[][] = [];
    for (let w = 0; w < WEEKS; w++) {
      out.push(cells.slice(w * 7, (w + 1) * 7));
    }
    return out;
  }, [cells]);

  const totalNewReviews = cells.reduce((s, c) => s + c.newReviews, 0);
  const activeDays = cells.filter((c) => c.newReviews > 0).length;

  const monthLabels = React.useMemo(() => {
    const labels: { weekIdx: number; label: string }[] = [];
    let lastMonth = -1;
    weeks.forEach((week, idx) => {
      const firstDay = week[0]?.date;
      if (firstDay) {
        const month = firstDay.getMonth();
        if (month !== lastMonth) {
          labels.push({
            weekIdx: idx,
            label: firstDay.toLocaleString("default", { month: "short" }),
          });
          lastMonth = month;
        }
      }
    });
    return labels;
  }, [weeks]);

  const dayLabels = ["Mon", "Wed", "Fri"];

  return (
    <Card className="gbp-card-hover">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="size-4 text-primary" aria-hidden="true" />
              Review Activity Heatmap
              {totalNewReviews > 0 && (
                <Badge
                  variant="outline"
                  className="ml-1 px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
                >
                  {totalNewReviews} new · {activeDays}d active
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              New reviews found per day over the last ~3 months. Darker =
              more new reviews.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchData}
            className="text-xs text-muted-foreground hover:text-foreground"
            aria-label="Refresh heatmap"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && !data ? (
          <Skeleton className="h-[120px] w-full rounded-md" />
        ) : error ? (
          <EmptyState
            icon={RefreshCw}
            title="Couldn't load heatmap"
            description={error}
            className="h-[120px]"
          />
        ) : totalNewReviews === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No activity yet"
            description="The heatmap will populate as scraper runs find new reviews over time."
            className="h-[120px]"
          />
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="overflow-x-auto gbp-scrollbar pb-1"
          >
            <div className="inline-flex flex-col gap-1">
              {/* Month labels row */}
              <div className="flex gap-1 pl-8 text-[10px] text-muted-foreground">
                {weeks.map((_, idx) => {
                  const label = monthLabels.find((m) => m.weekIdx === idx);
                  return (
                    <span
                      key={idx}
                      className="w-3 text-left"
                      style={{ minWidth: "12px" }}
                    >
                      {label?.label ?? ""}
                    </span>
                  );
                })}
              </div>
              {/* Day grid: day labels + weeks */}
              <div className="flex gap-1">
                {/* Day labels column */}
                <div className="flex flex-col gap-1 pr-1 text-[9px] text-muted-foreground">
                  {Array.from({ length: 7 }).map((_, dayIdx) => (
                    <span
                      key={dayIdx}
                      className="h-3 leading-3"
                      style={{ height: "12px" }}
                    >
                      {dayIdx % 2 === 0 ? dayLabels[dayIdx / 2] ?? "" : ""}
                    </span>
                  ))}
                </div>
                {/* Weeks */}
                {weeks.map((week, weekIdx) => (
                  <div key={weekIdx} className="flex flex-col gap-1">
                    {week.map((cell, dayIdx) => {
                      const level = computeLevel(cell.newReviews);
                      return (
                        <TooltipProvider key={dayIdx} delayDuration={150}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <motion.span
                                initial={{ scale: 0.5, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{
                                  duration: 0.2,
                                  delay: weekIdx * 0.01 + dayIdx * 0.005,
                                }}
                                className={
                                  "block size-3 rounded-sm ring-1 ring-inset ring-border/30 transition-colors hover:ring-primary/60 " +
                                  LEVEL_COLORS[level]
                                }
                                role="img"
                                aria-label={
                                  cell.newReviews > 0
                                    ? `${cell.dateStr}: ${cell.newReviews} new review${cell.newReviews === 1 ? "" : "s"}`
                                    : `${cell.dateStr}: no activity`
                                }
                              />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="font-semibold">
                                {cell.date.toLocaleDateString("default", {
                                  weekday: "short",
                                  month: "short",
                                  day: "numeric",
                                })}
                              </p>
                              {cell.newReviews > 0 ? (
                                <p className="text-xs opacity-90">
                                  <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                                    +{cell.newReviews}
                                  </span>{" "}
                                  new review{cell.newReviews === 1 ? "" : "s"} ·{" "}
                                  {cell.runs} run{cell.runs === 1 ? "" : "s"}
                                </p>
                              ) : (
                                <p className="text-xs opacity-70">No activity</p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      );
                    })}
                  </div>
                ))}
              </div>
              {/* Legend */}
              <div className="mt-2 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
                <span>Less</span>
                {LEVEL_COLORS.map((color, i) => (
                  <span
                    key={i}
                    className={"block size-3 rounded-sm ring-1 ring-inset ring-border/30 " + color}
                    aria-hidden="true"
                  />
                ))}
                <span>More</span>
              </div>
            </div>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
