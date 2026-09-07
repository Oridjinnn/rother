"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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
  // Custom bar shape: renders a normal rounded bar for count > 0, and a
  // hatched "no data" placeholder bar for count === 0.
  const renderBar = (props: Record<string, unknown>) => {
    const { x, y, width, height } = props as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    const payload = (props as { payload?: { count?: number } }).payload;
    const count = payload?.count ?? 0;
    if (count > 0) {
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
            <pattern
              id="hatch-no-data"
              patternUnits="userSpaceOnUse"
              width={6}
              height={6}
              patternTransform="rotate(45)"
            >
              <rect width={6} height={6} fill="var(--muted)" fillOpacity={0.3} />
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
          <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.4 }} content={<BranchTooltip />} />
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
