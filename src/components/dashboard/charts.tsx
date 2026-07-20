"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  LabelList,
  Cell as RCell,
} from "recharts";
import { Star, Smile, Meh, Frown } from "lucide-react";

import type {
  CompetitorStats,
  RatingDistribution,
  ReviewsOverTimePoint,
} from "@/lib/gbp/types";

interface RatingDistributionChartProps {
  data: RatingDistribution[];
}

const RATING_COLORS: Record<number, string> = {
  1: "oklch(0.58 0.22 27)",    // red/terracotta
  2: "oklch(0.65 0.18 35)",    // orange
  3: "oklch(0.72 0.16 75)",    // amber
  4: "oklch(0.65 0.13 165)",   // emerald
  5: "oklch(0.55 0.13 165)",   // deep emerald
};

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: RatingDistribution }>;
  label?: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const count = payload[0].value;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 flex items-center gap-1 font-semibold text-popover-foreground">
        <Star className="size-3 fill-amber-400 text-amber-500" aria-hidden="true" />
        {label}★ rating
      </div>
      <div className="text-popover-foreground">
        <span className="font-bold tabular-nums">{count}</span>{" "}
        <span className="text-muted-foreground">reviews</span>
      </div>
    </div>
  );
}

export function RatingDistributionChart({ data }: RatingDistributionChartProps) {
  // Ensure the data is sorted 1→5.
  const sorted = [...data].sort((a, b) => a.rating - b.rating);

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={sorted} margin={{ top: 16, right: 8, bottom: 0, left: -16 }}>
          <defs>
            {sorted.map((d) => (
              <linearGradient
                key={d.rating}
                id={`grad-rating-${d.rating}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={RATING_COLORS[d.rating]} stopOpacity={0.95} />
                <stop offset="100%" stopColor={RATING_COLORS[d.rating]} stopOpacity={0.6} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="rating"
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickFormatter={(v) => `${v}★`}
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
          <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.4 }} content={<CustomTooltip />} />
          <Bar dataKey="count" radius={[6, 6, 0, 0]} animationDuration={700}>
            {sorted.map((d) => (
              <RCell key={d.rating} fill={`url(#grad-rating-${d.rating})`} />
            ))}
            <LabelList
              dataKey="count"
              position="top"
              style={{ fill: "var(--foreground)", fontSize: 11, fontWeight: 600 }}
              formatter={(v: number) => (v === 0 ? "" : String(v))}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface CompetitorChartDataItem {
  competitor_id: string;
  name: string;
  total_reviews: number;
  new_reviews_count: number;
}

interface ReviewsPerCompetitorChartProps {
  data: CompetitorChartDataItem[];
}

const COMPETITOR_COLORS = [
  "oklch(0.55 0.13 165)",  // emerald
  "oklch(0.62 0.14 35)",   // terracotta
  "oklch(0.70 0.15 75)",   // amber
  "oklch(0.55 0.10 200)",  // teal
  "oklch(0.65 0.18 320)",  // frangipani
  "oklch(0.60 0.10 150)",  // moss
];

function CompetitorTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: CompetitorChartDataItem }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-semibold text-popover-foreground">{item.name}</div>
      <div className="text-popover-foreground">
        <span className="font-bold tabular-nums">{item.total_reviews}</span>{" "}
        <span className="text-muted-foreground">total reviews</span>
      </div>
      {item.new_reviews_count > 0 && (
        <div className="text-amber-600 dark:text-amber-400">
          <span className="font-bold tabular-nums">+{item.new_reviews_count}</span>{" "}
          <span className="text-muted-foreground">new this run</span>
        </div>
      )}
    </div>
  );
}

export function ReviewsPerCompetitorChart({ data }: ReviewsPerCompetitorChartProps) {
  // Sort by total_reviews desc; truncate names so they fit.
  const sorted = [...data]
    .filter((d) => d.total_reviews > 0)
    .sort((a, b) => b.total_reviews - a.total_reviews)
    .slice(0, 12)
    .map((d) => ({
      ...d,
      shortName: d.name.length > 22 ? d.name.slice(0, 20) + "…" : d.name,
    }));

  if (sorted.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
        No reviews yet — the scraper hasn't produced any snapshots.
      </div>
    );
  }

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={sorted}
          layout="vertical"
          margin={{ top: 4, right: 24, bottom: 4, left: 8 }}
        >
          <defs>
            {sorted.map((d, i) => (
              <linearGradient
                key={d.competitor_id}
                id={`grad-comp-${d.competitor_id}`}
                x1="0"
                y1="0"
                x2="1"
                y2="0"
              >
                <stop
                  offset="0%"
                  stopColor={COMPETITOR_COLORS[i % COMPETITOR_COLORS.length]}
                  stopOpacity={0.9}
                />
                <stop
                  offset="100%"
                  stopColor={COMPETITOR_COLORS[i % COMPETITOR_COLORS.length]}
                  stopOpacity={0.65}
                />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis
            type="number"
            allowDecimals={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="shortName"
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={130}
          />
          <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.4 }} content={<CompetitorTooltip />} />
          <Bar
            dataKey="total_reviews"
            radius={[0, 6, 6, 0]}
            animationDuration={700}
          >
            {sorted.map((d, i) => (
              <Cell
                key={d.competitor_id}
                fill={`url(#grad-comp-${d.competitor_id})`}
                stroke={COMPETITOR_COLORS[i % COMPETITOR_COLORS.length]}
                strokeWidth={0.5}
              />
            ))}
            <LabelList
              dataKey="total_reviews"
              position="right"
              style={{ fill: "var(--foreground)", fontSize: 11, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface NewReviewsPerBranchChartProps {
  data: { branch_id: string; branch_name: string; count: number }[];
}

function BranchTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: { branch_name: string; count: number } }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-semibold text-popover-foreground">{item.branch_name}</div>
      <div className="text-amber-600 dark:text-amber-400">
        <span className="font-bold tabular-nums">+{item.count}</span>{" "}
        <span className="text-muted-foreground">new reviews</span>
      </div>
    </div>
  );
}

export function NewReviewsPerBranchChart({ data }: NewReviewsPerBranchChartProps) {
  // Shorten branch names by stripping the common prefix.
  const shorten = (name: string) =>
    name.replace(/^Copenhagen Bali\s*-\s*/i, "").trim() || name;
  const sorted = [...data].sort((a, b) => b.count - a.count);
  // Max count for the "no data" bar height — 0-value bars render at ~20% of
  // the chart height so the hatched pattern is visible but clearly distinct
  // from real data.
  const maxCount = Math.max(1, ...sorted.map((d) => d.count));

  // Custom bar shape: renders a normal rounded bar for count > 0, and a
  // hatched "no data" placeholder bar for count === 0. The hatched bar sits
  // at a fixed small height (20% of the chart) so the branch name on the
  // X axis has a visual anchor rather than empty space.
  const renderBar = (props: Record<string, unknown>) => {
    // recharts passes a complex props object; we extract what we need.
    const { x, y, width, height } = props as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    const payload = (props as { payload?: { count?: number } }).payload;
    const count = payload?.count ?? 0;
    if (count > 0) {
      // Normal bar — render as a rounded rectangle with the gradient fill.
      return (
        <g>
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            rx={6}
            ry={6}
            fill="url(#grad-branch-new)"
          />
        </g>
      );
    }
    // 0-value bar — render a hatched "no data" placeholder.
    // Height = 20% of the chart's bar area, positioned at the bottom.
    const chartBarAreaHeight = (props as { background?: { height?: number } })
      .background?.height ?? height;
    const noDataHeight = Math.max(8, chartBarAreaHeight * 0.18);
    const noDataY = y + height - noDataHeight;
    return (
      <g>
        <rect
          x={x}
          y={noDataY}
          width={width}
          height={noDataHeight}
          rx={4}
          ry={4}
          fill="url(#hatch-no-data)"
          stroke="var(--muted-foreground)"
          strokeOpacity={0.25}
          strokeWidth={0.5}
          strokeDasharray="2 2"
        />
      </g>
    );
  };

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={sorted} margin={{ top: 16, right: 8, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="grad-branch-new" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.70 0.15 75)" stopOpacity={0.95} />
              <stop offset="100%" stopColor="oklch(0.70 0.15 75)" stopOpacity={0.55} />
            </linearGradient>
            {/* Hatched pattern for 0-value "no data" bars — diagonal lines
                on a muted background, clearly distinct from real data bars. */}
            <pattern
              id="hatch-no-data"
              patternUnits="userSpaceOnUse"
              width={6}
              height={6}
              patternTransform="rotate(45)"
            >
              <rect
                width={6}
                height={6}
                fill="var(--muted)"
                fillOpacity={0.3}
              />
              <line
                x1="0"
                y1="0"
                x2="0"
                y2={6}
                stroke="var(--muted-foreground)"
                strokeWidth={1.5}
                strokeOpacity={0.35}
              />
            </pattern>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="branch_name"
            tickFormatter={shorten}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            interval={0}
            angle={-12}
            textAnchor="end"
            height={48}
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
            content={<BranchTooltip />}
          />
          <Bar
            dataKey="count"
            fill="url(#grad-branch-new)"
            radius={[6, 6, 0, 0]}
            animationDuration={700}
            shape={renderBar as never}
          >
            <LabelList
              dataKey="count"
              position="top"
              style={{ fill: "var(--foreground)", fontSize: 11, fontWeight: 600 }}
              formatter={(v: number) => (v === 0 ? "—" : `+${v}`)}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sentiment Distribution donut chart (rating-based heuristic — Rule 4 compliant,
// no AI/LLM). Buckets:
//   - Positive: 4–5 stars
//   - Neutral:  3 stars
//   - Negative: 1–2 stars
// ─────────────────────────────────────────────────────────────────────────────

interface SentimentSlice {
  name: "Positive" | "Neutral" | "Negative";
  key: "positive" | "neutral" | "negative";
  count: number;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SENTIMENT_COLORS: Record<SentimentSlice["key"], string> = {
  positive: "oklch(0.55 0.13 165)", // emerald
  neutral: "oklch(0.70 0.15 75)", // amber
  negative: "oklch(0.58 0.22 27)", // terracotta/red
};

function SentimentTooltipContent({
  slice,
  total,
}: {
  slice: SentimentSlice;
  total: number;
}) {
  const pct = total > 0 ? ((slice.count / total) * 100).toFixed(1) : "0.0";
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-0.5 flex items-center gap-1.5 font-semibold text-popover-foreground">
        <slice.icon className="size-3" aria-hidden="true" />
        {slice.name}
      </div>
      <div className="text-popover-foreground">
        <span className="font-bold tabular-nums">{slice.count}</span>{" "}
        <span className="text-muted-foreground">reviews</span>{" "}
        <span className="text-muted-foreground">({pct}%)</span>
      </div>
    </div>
  );
}

export function SentimentDistributionChart({
  data,
}: RatingDistributionChartProps) {
  // Bucket the 1-5 rating distribution into sentiment slices.
  const slices: SentimentSlice[] = React.useMemo(() => {
    const buckets = { positive: 0, neutral: 0, negative: 0 };
    for (const d of data) {
      if (d.rating >= 4) buckets.positive += d.count;
      else if (d.rating === 3) buckets.neutral += d.count;
      else buckets.negative += d.count;
    }
    return [
      {
        name: "Positive" as const,
        key: "positive" as const,
        count: buckets.positive,
        color: SENTIMENT_COLORS.positive,
        icon: Smile,
      },
      {
        name: "Neutral" as const,
        key: "neutral" as const,
        count: buckets.neutral,
        color: SENTIMENT_COLORS.neutral,
        icon: Meh,
      },
      {
        name: "Negative" as const,
        key: "negative" as const,
        count: buckets.negative,
        color: SENTIMENT_COLORS.negative,
        icon: Frown,
      },
    ].filter((s) => s.count > 0); // hide empty slices
  }, [data]);

  const total = slices.reduce((s, x) => s + x.count, 0);
  const positivePct = total > 0 ? (slices[0]?.count ?? 0) / total : 0;
  // Render-prop style tooltip — recharts passes `active` + `payload` props.
  // We use a stable render function that reads `total` from the closure
  // without creating a new component identity on every render.
  const renderTooltip = (props: {
    active?: boolean;
    payload?: Array<{ payload: SentimentSlice }>;
  }) => {
    if (!props.active || !props.payload || props.payload.length === 0)
      return null;
    return <SentimentTooltipContent slice={props.payload[0].payload} total={total} />;
  };

  if (total === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
        No ratings yet — the scraper hasn&apos;t produced any snapshots.
      </div>
    );
  }

  return (
    <div className="flex h-[260px] w-full flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
      {/* Donut chart */}
      <div className="relative h-[180px] w-[180px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="count"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={80}
              paddingAngle={2}
              stroke="var(--background)"
              strokeWidth={2}
              animationDuration={700}
            >
              {slices.map((s) => (
                <Cell key={s.key} fill={s.color} />
              ))}
            </Pie>
            <Tooltip content={renderTooltip} />
          </PieChart>
        </ResponsiveContainer>
        {/* Center label */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums text-foreground">
            {total}
          </span>
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            reviews
          </span>
        </div>
      </div>

      {/* Legend with counts + percentages */}
      <div className="flex w-full flex-col gap-1.5 sm:w-auto">
        {slices.map((s) => {
          const pct = total > 0 ? (s.count / total) * 100 : 0;
          return (
            <div
              key={s.key}
              className="flex items-center justify-between gap-3 rounded-md border border-border/40 bg-muted/20 px-2.5 py-1.5"
            >
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: s.color }}
                  aria-hidden="true"
                />
                <s.icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
                {s.name}
              </span>
              <span className="text-xs font-semibold tabular-nums text-foreground">
                {s.count}
                <span className="ml-1 font-normal text-muted-foreground">
                  ({pct.toFixed(0)}%)
                </span>
              </span>
            </div>
          );
        })}
        {/* Positive-rate highlight footer */}
        <div className="mt-1 border-t border-border/40 pt-1.5 text-center sm:text-right">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Positive rate:{" "}
          </span>
          <span
            className={
              "text-sm font-bold tabular-nums " +
              (positivePct >= 0.7
                ? "text-emerald-600 dark:text-emerald-400"
                : positivePct >= 0.5
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-destructive")
            }
          >
            {(positivePct * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reviews count over time — combo area + bar chart.
// Area = cumulative total reviews monitored (left axis).
// Bars = new reviews per scrape date (right axis, smaller).
// ─────────────────────────────────────────────────────────────────────────────

interface ReviewsOverTimeChartProps {
  data: ReviewsOverTimePoint[];
}

function OverTimeTooltipContent({
  point,
}: {
  point: ReviewsOverTimePoint;
}) {
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-semibold text-popover-foreground">{point.date}</div>
      <div className="text-popover-foreground">
        <span className="font-bold tabular-nums text-amber-600 dark:text-amber-400">
          +{point.new_reviews}
        </span>{" "}
        <span className="text-muted-foreground">new</span>
      </div>
      <div className="text-popover-foreground">
        <span className="font-bold tabular-nums text-primary">{point.cumulative}</span>{" "}
        <span className="text-muted-foreground">total monitored</span>
      </div>
    </div>
  );
}

export function ReviewsOverTimeChart({ data }: ReviewsOverTimeChartProps) {
  const renderTooltip = (props: {
    active?: boolean;
    payload?: Array<{ payload: ReviewsOverTimePoint }>;
  }) => {
    if (!props.active || !props.payload || props.payload.length === 0)
      return null;
    return <OverTimeTooltipContent point={props.payload[0].payload} />;
  };

  if (data.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
        No scrape history yet — the chart will populate once runs produce reviews.
      </div>
    );
  }

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 16, right: 12, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient id="grad-overtime" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.55 0.13 165)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="oklch(0.55 0.13 165)" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: string) => v.slice(5)} // MM-DD only
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={36}
          />
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1, strokeDasharray: "3 3" }}
            content={renderTooltip}
          />
          <Area
            type="monotone"
            dataKey="cumulative"
            stroke="oklch(0.55 0.13 165)"
            strokeWidth={2.5}
            fill="url(#grad-overtime)"
            animationDuration={700}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Competitor comparison radar chart.
// Compares the top N competitors across 4 normalized dimensions (0-100):
//   - Reviews: total_reviews (normalized to max)
//   - Rating: average_rating / 5 * 100
//   - New: new_reviews_count (normalized to max)
//   - Recency: 100 if scraped today, decaying to 0 if never scraped
// ─────────────────────────────────────────────────────────────────────────────

interface CompetitorRadarChartProps {
  data: CompetitorStats[];
  /** Number of competitors to show (default 3). */
  topN?: number;
}

const RADAR_COLORS = [
  { stroke: "oklch(0.55 0.13 165)", fill: "oklch(0.55 0.13 165)" }, // emerald
  { stroke: "oklch(0.62 0.14 35)", fill: "oklch(0.62 0.14 35)" },   // terracotta
  { stroke: "oklch(0.70 0.15 75)", fill: "oklch(0.70 0.15 75)" },   // amber
  { stroke: "oklch(0.55 0.10 200)", fill: "oklch(0.55 0.10 200)" }, // teal
];

function computeRecencyScore(lastScrapedAt: string | null): number {
  if (!lastScrapedAt) return 0;
  const then = new Date(lastScrapedAt).getTime();
  if (Number.isNaN(then)) return 0;
  const now = Date.now();
  const daysAgo = (now - then) / (1000 * 60 * 60 * 24);
  if (daysAgo <= 0) return 100;
  if (daysAgo >= 7) return 0;
  // Linear decay: 100 today, 0 at 7 days
  return Math.round(100 * (1 - daysAgo / 7));
}

export function CompetitorRadarChart({
  data,
  topN = 3,
}: CompetitorRadarChartProps) {
  // Pick the top N competitors by total_reviews (only those with reviews).
  const competitors = React.useMemo(() => {
    return [...data]
      .filter((c) => c.total_reviews > 0)
      .sort((a, b) => b.total_reviews - a.total_reviews)
      .slice(0, topN);
  }, [data, topN]);

  // Normalize each dimension to 0-100 using the max across the selected competitors.
  const radarData = React.useMemo(() => {
    if (competitors.length === 0) return [];
    const maxReviews = Math.max(1, ...competitors.map((c) => c.total_reviews));
    const maxNew = Math.max(1, ...competitors.map((c) => c.new_reviews_count));
    const dimensions = ["Reviews", "Rating", "New", "Recency"] as const;
    return dimensions.map((dim) => {
      const point: Record<string, number | string> = { dimension: dim };
      for (const c of competitors) {
        let val = 0;
        if (dim === "Reviews") val = (c.total_reviews / maxReviews) * 100;
        else if (dim === "Rating")
          val = c.average_rating ? (c.average_rating / 5) * 100 : 0;
        else if (dim === "New") val = (c.new_reviews_count / maxNew) * 100;
        else if (dim === "Recency")
          val = computeRecencyScore(c.last_scraped_at);
        point[c.name] = Math.round(val);
      }
      return point;
    });
  }, [competitors]);

  if (competitors.length === 0) {
    return (
      <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
        No competitor data yet — run the scraper to populate the comparison.
      </div>
    );
  }

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={radarData} margin={{ top: 16, right: 30, bottom: 16, left: 30 }}>
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          />
          {competitors.map((c, i) => (
            <Radar
              key={c.competitor_id}
              name={c.name}
              dataKey={c.name}
              stroke={RADAR_COLORS[i % RADAR_COLORS.length].stroke}
              strokeWidth={2}
              fill={RADAR_COLORS[i % RADAR_COLORS.length].fill}
              fillOpacity={0.15}
              animationDuration={700}
            />
          ))}
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "0.5rem",
              fontSize: "12px",
              color: "var(--popover-foreground)",
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
      {/* Legend */}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
        {competitors.map((c, i) => (
          <span
            key={c.competitor_id}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: RADAR_COLORS[i % RADAR_COLORS.length].fill }}
              aria-hidden="true"
            />
            <span className="font-medium text-foreground/80">{c.name}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
