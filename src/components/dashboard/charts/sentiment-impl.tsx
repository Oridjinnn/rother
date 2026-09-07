"use client";

import * as React from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Smile, Meh, Frown } from "lucide-react";

import type { RatingDistribution } from "@/lib/gbp/types";

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

export function SentimentDistributionChart({ data }: { data: RatingDistribution[] }) {
  // Bucket the 1-5 rating distribution into sentiment slices.
  const slices: SentimentSlice[] = React.useMemo(() => {
    const buckets = { positive: 0, neutral: 0, negative: 0 };
    for (const d of data) {
      if (d.rating >= 4) buckets.positive += d.count;
      else if (d.rating === 3) buckets.neutral += d.count;
      else buckets.negative += d.count;
    }
    return [
      { name: "Positive" as const, key: "positive" as const, count: buckets.positive, color: SENTIMENT_COLORS.positive, icon: Smile },
      { name: "Neutral" as const, key: "neutral" as const, count: buckets.neutral, color: SENTIMENT_COLORS.neutral, icon: Meh },
      { name: "Negative" as const, key: "negative" as const, count: buckets.negative, color: SENTIMENT_COLORS.negative, icon: Frown },
    ].filter((s) => s.count > 0);
  }, [data]);

  const total = slices.reduce((s, x) => s + x.count, 0);
  const positivePct = total > 0 ? (slices[0]?.count ?? 0) / total : 0;
  const renderTooltip = (props: {
    active?: boolean;
    payload?: Array<{ payload: SentimentSlice }>;
  }) => {
    if (!props.active || !props.payload || props.payload.length === 0) return null;
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
            <Tooltip content={renderTooltip as unknown as React.ReactElement} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums text-foreground">{total}</span>
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            reviews
          </span>
        </div>
      </div>

      <div className="flex w-full flex-col gap-1.5 sm:w-auto">
        {slices.map((s) => {
          const pct = total > 0 ? (s.count / total) * 100 : 0;
          return (
            <div
              key={s.key}
              className="flex items-center justify-between gap-3 rounded-md border border-border/40 bg-muted/20 px-2.5 py-1.5"
            >
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
                <s.icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
                {s.name}
              </span>
              <span className="text-xs font-semibold tabular-nums text-foreground">
                {s.count}
                <span className="ml-1 font-normal text-muted-foreground">({pct.toFixed(0)}%)</span>
              </span>
            </div>
          );
        })}
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
