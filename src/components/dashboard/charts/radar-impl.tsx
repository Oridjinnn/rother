"use client";

import * as React from "react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, Tooltip, ResponsiveContainer } from "recharts";

import type { CompetitorStats } from "@/lib/gbp/types";

const RADAR_COLORS = [
  { stroke: "oklch(0.55 0.13 165)", fill: "oklch(0.55 0.13 165)" }, // emerald
  { stroke: "oklch(0.62 0.14 35)", fill: "oklch(0.62 0.14 35)" }, // terracotta
  { stroke: "oklch(0.70 0.15 75)", fill: "oklch(0.70 0.15 75)" }, // amber
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
  return Math.round(100 * (1 - daysAgo / 7));
}

export function CompetitorRadarChart({
  data,
  topN = 3,
}: {
  data: CompetitorStats[];
  topN?: number;
}) {
  const competitors = React.useMemo(() => {
    return [...data]
      .filter((c) => c.total_reviews > 0)
      .sort((a, b) => b.total_reviews - a.total_reviews)
      .slice(0, topN);
  }, [data, topN]);

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
        else if (dim === "Rating") val = c.average_rating ? (c.average_rating / 5) * 100 : 0;
        else if (dim === "New") val = (c.new_reviews_count / maxNew) * 100;
        else if (dim === "Recency") val = computeRecencyScore(c.last_scraped_at);
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
          <PolarAngleAxis dataKey="dimension" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
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
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
        {competitors.map((c, i) => (
          <span key={c.competitor_id} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
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
