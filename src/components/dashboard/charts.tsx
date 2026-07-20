"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  LabelList,
  Cell as RCell,
} from "recharts";
import { Star } from "lucide-react";

import type { RatingDistribution } from "@/lib/gbp/types";

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

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={sorted} margin={{ top: 16, right: 8, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="grad-branch-new" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.70 0.15 75)" stopOpacity={0.95} />
              <stop offset="100%" stopColor="oklch(0.70 0.15 75)" stopOpacity={0.55} />
            </linearGradient>
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
          >
            <LabelList
              dataKey="count"
              position="top"
              style={{ fill: "var(--foreground)", fontSize: 11, fontWeight: 600 }}
              formatter={(v: number) => (v === 0 ? "" : `+${v}`)}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
