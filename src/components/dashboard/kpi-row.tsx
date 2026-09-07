"use client";

import * as React from "react";
import { Building2, Store, FileText, TrendingUp, Clock } from "lucide-react";

import { KpiCard } from "./kpi-card";
import { useOverview } from "@/lib/gbp/use-overview";
import { formatTimestamp } from "@/lib/gbp/format";

export function KpiRow() {
  const { data, loading } = useOverview();

  if (loading && !data) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-muted/40" />
        ))}
      </div>
    );
  }
  if (!data) return null;

  const ts = formatTimestamp(
    data.runSummary?.finished_at ?? data.runSummary?.started_at,
  );

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      <KpiCard
        label="Branches"
        value={data.totalBranches}
        icon={Building2}
        accent="primary"
        hint="All locations"
      />
      <KpiCard
        label="Competitors"
        value={data.totalCompetitors}
        icon={Store}
        accent="teal"
        hint="2 per branch"
      />
      <KpiCard
        label="Reviews Monitored"
        value={data.totalReviews}
        icon={FileText}
        accent="primary"
        hint="Across all snapshots"
      />
      <KpiCard
        label="New (Latest)"
        value={`+${data.newReviewsLastRun}`}
        icon={TrendingUp}
        accent="amber"
        hint="From latest update"
      />
      <KpiCard
        label="Last Run"
        value={
          <span className="text-base font-bold leading-tight">{ts.relative}</span>
        }
        icon={Clock}
        accent="teal"
        hint={<span className="font-mono text-[10px]">{ts.absolute}</span>}
      />
    </div>
  );
}
