"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell as RCell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Star } from "lucide-react";

import type { RatingDistribution } from "@/lib/gbp/types";

const RATING_COLORS: Record<number, string> = {
  1: "oklch(0.58 0.22 27)", // red/terracotta
  2: "oklch(0.65 0.18 35)", // orange
  3: "oklch(0.72 0.16 75)", // amber
  4: "oklch(0.65 0.13 165)", // emerald
  5: "oklch(0.55 0.13 165)", // deep emerald
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

export function RatingDistributionChart({ data }: { data: RatingDistribution[] }) {
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
