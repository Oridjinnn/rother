"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ReviewsOverTimePoint } from "@/lib/gbp/types";

function OverTimeTooltipContent({ point }: { point: ReviewsOverTimePoint }) {
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

export function ReviewsOverTimeChart({ data }: { data: ReviewsOverTimePoint[] }) {
  const renderTooltip = (props: {
    active?: boolean;
    payload?: Array<{ payload: ReviewsOverTimePoint }>;
  }) => {
    if (!props.active || !props.payload || props.payload.length === 0) return null;
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
            content={renderTooltip as unknown as React.ReactElement}
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
