"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { AlignLeft, RefreshCw } from "lucide-react";

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
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "./empty-state";
import type { ReviewLengthsResponse } from "@/lib/gbp/types";

interface ReviewLengthsCardProps {
  /** Bump to force a refetch. */
  refreshKey?: number;
}

function LengthTooltipContent({
  bucket,
}: {
  bucket: { label: string; range: string; count: number };
}) {
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-0.5 font-semibold text-popover-foreground">
        {bucket.label}
      </div>
      <div className="text-popover-foreground">
        <span className="font-bold tabular-nums">{bucket.count}</span>{" "}
        <span className="text-muted-foreground">reviews</span>
      </div>
      <div className="text-[10px] text-muted-foreground">{bucket.range} chars</div>
    </div>
  );
}

/**
 * "Review Text Length" card — a bar chart showing the distribution of review
 * text lengths across 5 buckets (Empty, Short, Medium, Long, Very Long).
 * Self-fetches from /api/review-lengths on mount + when refreshKey changes.
 *
 * Includes a stats footer (average, median, min, max character counts) so
 * users can see the central tendency alongside the distribution shape.
 */
export function ReviewLengthsCard({ refreshKey }: ReviewLengthsCardProps) {
  const [data, setData] = React.useState<ReviewLengthsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchData = React.useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/review-lengths", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `failed (${res.status})`);
      }
      const json: ReviewLengthsResponse = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetchData();
  }, [fetchData, refreshKey]);

  const renderTooltip = (props: {
    active?: boolean;
    payload?: Array<{ payload: { label: string; range: string; count: number } }>;
  }) => {
    if (!props.active || !props.payload || props.payload.length === 0)
      return null;
    return <LengthTooltipContent bucket={props.payload[0].payload} />;
  };

  return (
    <Card className="gbp-card-hover">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlignLeft className="size-4 text-primary" aria-hidden="true" />
              Review Text Length
              {data && data.stats.total > 0 && (
                <Badge
                  variant="outline"
                  className="ml-1 px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
                >
                  {data.stats.total} reviews
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Distribution of review text lengths — helps identify which
              competitors get detailed vs. terse reviews.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchData}
            className="text-xs text-muted-foreground hover:text-foreground"
            aria-label="Refresh review lengths"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && !data ? (
          <Skeleton className="h-[260px] w-full rounded-md" />
        ) : error ? (
          <EmptyState
            icon={RefreshCw}
            title="Couldn't load review lengths"
            description={error}
            className="h-[260px]"
          />
        ) : data && data.stats.total > 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="space-y-3"
          >
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.buckets}
                  margin={{ top: 16, right: 8, bottom: 0, left: -16 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                    content={renderTooltip as unknown as React.ReactElement}
                  />
                  <Bar
                    dataKey="count"
                    radius={[6, 6, 0, 0]}
                    animationDuration={700}
                  >
                    {data.buckets.map((b) => (
                      <Cell key={b.label} fill={b.color} />
                    ))}
                    <LabelList
                      dataKey="count"
                      position="top"
                      style={{
                        fill: "var(--foreground)",
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                      formatter={(v: number) => (v === 0 ? "" : String(v))}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Stats footer */}
            <div className="grid grid-cols-4 gap-2 border-t border-border/40 pt-2">
              <Stat label="Avg" value={data.stats.average} unit="chars" />
              <Stat label="Median" value={data.stats.median} unit="chars" />
              <Stat label="Min" value={data.stats.min} unit="chars" />
              <Stat label="Max" value={data.stats.max} unit="chars" />
            </div>
          </motion.div>
        ) : (
          <EmptyState
            icon={AlignLeft}
            title="No review text yet"
            description="The chart will populate once the scraper collects reviews with text."
            className="h-[260px]"
          />
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <div className="text-center">
      <div className="text-lg font-bold tabular-nums text-foreground">
        {value.toLocaleString()}
      </div>
      <div className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
        {label} · {unit}
      </div>
    </div>
  );
}
