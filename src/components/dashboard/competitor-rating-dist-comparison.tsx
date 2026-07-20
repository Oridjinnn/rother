"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { RefreshCw, BarChart3 } from "lucide-react";

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
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "./empty-state";

interface CompetitorRatingDistComparisonProps {
  refreshKey?: number;
}

interface CompetitorDist {
  competitor_id: string;
  name: string;
  distribution: number[]; // [1★,2★,3★,4★,5★]
  total: number;
}

interface RatingDistResponse {
  competitors: Array<{
    competitor_id: string;
    name: string;
    branch_name: string;
    distribution: number[];
  }>;
}

const RATING_COLORS = [
  "oklch(0.58 0.22 27)", // 1★ red
  "oklch(0.65 0.18 35)", // 2★ orange
  "oklch(0.72 0.16 75)", // 3★ amber
  "oklch(0.65 0.13 165)", // 4★ emerald
  "oklch(0.55 0.13 165)", // 5★ deep emerald
];

/**
 * Competitor Rating Distribution Comparison — a grouped bar chart showing
 * each competitor's 1★–5★ rating breakdown side-by-side. Each competitor
 * is a group on the X axis, with 5 colored bars (one per star rating)
 * within each group.
 *
 * This is different from the overall "Rating Distribution" chart (which
 * aggregates all reviews) — this breaks it down per competitor so you
 * can see which competitors get more 5★ vs 3★ reviews.
 *
 * Self-fetches from /api/competitor-correlation (reuses the same data —
 * the response includes per-competitor rating distributions). No new
 * API needed.
 */
export function CompetitorRatingDistComparison({
  refreshKey,
}: CompetitorRatingDistComparisonProps) {
  const [data, setData] = React.useState<RatingDistResponse | null>(null);
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
      const json: RatingDistResponse = await res.json();
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

  // Transform into recharts format: [{ name: "Comp A", "1★": 0, "2★": 0, ... }, ...]
  const chartData = React.useMemo(() => {
    if (!data) return [];
    return data.competitors.map((c) => ({
      name: c.name.length > 16 ? c.name.slice(0, 14) + "…" : c.name,
      fullName: c.name,
      "1★": c.distribution[0] ?? 0,
      "2★": c.distribution[1] ?? 0,
      "3★": c.distribution[2] ?? 0,
      "4★": c.distribution[3] ?? 0,
      "5★": c.distribution[4] ?? 0,
    }));
  }, [data]);

  const totalReviews = chartData.reduce(
    (s, c) => s + c["1★"] + c["2★"] + c["3★"] + c["4★"] + c["5★"],
    0,
  );

  if (loading && !data) {
    return (
      <Card className="gbp-card-hover">
        <CardHeader>
          <Skeleton className="h-5 w-56" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[280px] w-full rounded-md" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="gbp-card-hover">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="size-4 text-primary" aria-hidden="true" />
            Rating Distribution by Competitor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={RefreshCw}
            title="Couldn't load data"
            description={error}
            className="h-[280px]"
          />
        </CardContent>
      </Card>
    );
  }

  if (!data || chartData.length === 0 || totalReviews === 0) {
    return (
      <Card className="gbp-card-hover">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="size-4 text-primary" aria-hidden="true" />
            Rating Distribution by Competitor
          </CardTitle>
          <CardDescription>
            Per-competitor 1★–5★ breakdown.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={BarChart3}
            title="No competitor data yet"
            description="Run the scraper to populate the comparison."
            className="h-[280px]"
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
              <BarChart3 className="size-4 text-primary" aria-hidden="true" />
              Rating Distribution by Competitor
              <Badge
                variant="outline"
                className="ml-1 px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
              >
                {chartData.length} competitor{chartData.length === 1 ? "" : "s"}
              </Badge>
            </CardTitle>
            <CardDescription>
              Per-competitor 1★–5★ breakdown — shows which competitors
              get more 5★ vs 3★ reviews.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchData}
            className="text-xs text-muted-foreground hover:text-foreground"
            aria-label="Refresh rating distribution"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 8, bottom: 40, left: -8 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                  height={50}
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
                  contentStyle={{
                    backgroundColor: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.5rem",
                    fontSize: "12px",
                    color: "var(--popover-foreground)",
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                  iconType="circle"
                />
                {["1★", "2★", "3★", "4★", "5★"].map((rating, i) => (
                  <Bar
                    key={rating}
                    dataKey={rating}
                    stackId="ratings"
                    fill={RATING_COLORS[i]}
                    radius={i === 4 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                    animationDuration={700}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </CardContent>
    </Card>
  );
}
