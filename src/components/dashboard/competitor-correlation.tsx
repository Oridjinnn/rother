"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Grid3x3, RefreshCw } from "lucide-react";

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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { EmptyState } from "./empty-state";

interface CompetitorCorrelationProps {
  refreshKey?: number;
}

interface CompetitorInfo {
  competitor_id: string;
  name: string;
  branch_name: string;
  distribution: number[];
}

interface CorrelationData {
  competitors: CompetitorInfo[];
  matrix: number[][];
  maxCompetitors: number;
}

/**
 * Returns a color for a correlation value (0-1 scale).
 * 0 = transparent/red (no correlation), 1 = emerald (identical).
 */
function getCorrelationColor(value: number): { bg: string; text: string } {
  if (value >= 0.9) return { bg: "oklch(0.55 0.13 165)", text: "text-primary-foreground" };
  if (value >= 0.7) return { bg: "oklch(0.65 0.10 165)", text: "text-primary-foreground" };
  if (value >= 0.5) return { bg: "oklch(0.75 0.08 165)", text: "text-foreground" };
  if (value >= 0.3) return { bg: "oklch(0.70 0.15 75)", text: "text-foreground" };
  if (value > 0) return { bg: "oklch(0.62 0.14 35)", text: "text-primary-foreground" };
  return { bg: "var(--muted)", text: "text-muted-foreground" };
}

function shortenName(name: string): string {
  // Show first 10 chars + … for long names
  return name.length > 12 ? name.slice(0, 10) + "…" : name;
}

/**
 * Competitor Correlation Matrix — a heatmap showing the similarity of
 * rating distributions between each pair of competitors. Uses cosine
 * similarity on the 1★–5★ rating count vectors.
 *
 * The matrix is N×N (diagonal = 1, self-similarity). Cells are colored
 * from red (low correlation) through amber to emerald (high correlation).
 * Hovering a cell shows a tooltip with both competitors' names + the
 * similarity score.
 *
 * Self-fetches from /api/competitor-correlation on mount + when refreshKey
 * changes. Capped at 12 competitors (top by total reviews).
 */
export function CompetitorCorrelation({ refreshKey }: CompetitorCorrelationProps) {
  const [data, setData] = React.useState<CorrelationData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchData = React.useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/competitor-correlation", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `failed (${res.status})`);
      }
      const json: CorrelationData = await res.json();
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

  if (loading && !data) {
    return (
      <Card className="gbp-card-hover">
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[240px] w-full rounded-md" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="gbp-card-hover">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Grid3x3 className="size-4 text-primary" aria-hidden="true" />
            Competitor Correlation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={RefreshCw}
            title="Couldn't load correlation"
            description={error}
            className="h-[240px]"
          />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.competitors.length < 2) {
    return (
      <Card className="gbp-card-hover">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Grid3x3 className="size-4 text-primary" aria-hidden="true" />
            Competitor Correlation
          </CardTitle>
          <CardDescription>
            Rating distribution similarity (cosine similarity).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Grid3x3}
            title="Need at least 2 competitors"
            description="The correlation matrix needs 2+ competitors with reviews to compare."
            className="h-[240px]"
          />
        </CardContent>
      </Card>
    );
  }

  const { competitors, matrix } = data;
  const n = competitors.length;
  const cellSize = n <= 6 ? 40 : n <= 9 ? 32 : 26;

  return (
    <Card className="gbp-card-hover">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Grid3x3 className="size-4 text-primary" aria-hidden="true" />
              Competitor Correlation
            </CardTitle>
            <CardDescription>
              Rating distribution similarity (cosine similarity, 0–1).
              Darker green = more similar rating patterns.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchData}
            className="text-xs text-muted-foreground hover:text-foreground"
            aria-label="Refresh correlation matrix"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto gbp-scrollbar pb-1">
          <div className="inline-block">
            {/* Column headers (competitor names, rotated) */}
            <div className="flex" style={{ paddingLeft: `${cellSize + 8}px` }}>
              {competitors.map((c, i) => (
                <div
                  key={i}
                  className="flex items-end justify-center"
                  style={{ width: `${cellSize}px`, height: "60px" }}
                >
                  <span
                    className="text-[9px] font-medium text-muted-foreground"
                    style={{
                      writingMode: "vertical-rl",
                      transform: "rotate(180deg)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: "55px",
                    }}
                    title={c.name}
                  >
                    {shortenName(c.name)}
                  </span>
                </div>
              ))}
            </div>
            {/* Matrix rows */}
            {competitors.map((rowComp, i) => (
              <div key={i} className="flex items-center">
                {/* Row header (competitor name) */}
                <div
                  className="flex shrink-0 items-center justify-end pr-1 text-right"
                  style={{ width: `${cellSize + 8}px`, height: `${cellSize}px` }}
                >
                  <span
                    className="truncate text-[9px] font-medium text-muted-foreground"
                    style={{ maxWidth: `${cellSize + 4}px` }}
                    title={rowComp.name}
                  >
                    {shortenName(rowComp.name)}
                  </span>
                </div>
                {/* Cells */}
                {matrix[i].map((value, j) => {
                  const colors = getCorrelationColor(value);
                  const isDiagonal = i === j;
                  return (
                    <TooltipProvider key={j} delayDuration={150}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{
                              duration: 0.15,
                              delay: (i * n + j) * 0.008,
                            }}
                            className={
                              "flex shrink-0 items-center justify-center rounded-sm text-[10px] font-bold tabular-nums transition-transform hover:scale-110 hover:z-10 " +
                              colors.text +
                              (isDiagonal ? " ring-1 ring-inset ring-border" : "")
                            }
                            style={{
                              width: `${cellSize}px`,
                              height: `${cellSize}px`,
                              backgroundColor: colors.bg,
                              margin: "1px",
                            }}
                            role="img"
                            aria-label={`${rowComp.name} vs ${competitors[j].name}: ${value.toFixed(2)} similarity`}
                          >
                            {value.toFixed(2)}
                          </motion.div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="font-semibold">
                            {rowComp.name} × {competitors[j].name}
                          </p>
                          <p className="text-xs opacity-90">
                            Similarity:{" "}
                            <span className="font-bold tabular-nums">
                              {(value * 100).toFixed(0)}%
                            </span>
                          </p>
                          <div className="mt-1 grid grid-cols-2 gap-x-2 text-[10px] opacity-70">
                            <span>
                              {rowComp.name}:{" "}
                              {rowComp.distribution.join("/")}
                            </span>
                            <span>
                              {competitors[j].name}:{" "}
                              {competitors[j].distribution.join("/")}
                            </span>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        {/* Legend */}
        <div className="mt-3 flex items-center justify-center gap-3 text-[10px] text-muted-foreground">
          <span>Less similar</span>
          <div className="flex gap-0.5">
            <span className="block size-3 rounded-sm" style={{ backgroundColor: "var(--muted)" }} />
            <span className="block size-3 rounded-sm" style={{ backgroundColor: "oklch(0.62 0.14 35)" }} />
            <span className="block size-3 rounded-sm" style={{ backgroundColor: "oklch(0.70 0.15 75)" }} />
            <span className="block size-3 rounded-sm" style={{ backgroundColor: "oklch(0.75 0.08 165)" }} />
            <span className="block size-3 rounded-sm" style={{ backgroundColor: "oklch(0.65 0.10 165)" }} />
            <span className="block size-3 rounded-sm" style={{ backgroundColor: "oklch(0.55 0.13 165)" }} />
          </div>
          <span>More similar</span>
        </div>
      </CardContent>
    </Card>
  );
}
