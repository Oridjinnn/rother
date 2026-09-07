"use client";

import * as React from "react";
import {
  Activity,
  Loader2,
  MapPin,
  Network,
  Radar,
  RefreshCw,
  Users,
} from "lucide-react";

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
import { EmptyState } from "@/components/dashboard/empty-state";

interface BranchHealth {
  branch_id: string;
  branch_name: string;
  competitorCount: number;
  nearestM: number | null;
  densityPerKm2: number | null;
  enriched: number;
}

interface HealthResponse {
  discoveredAt: string | null;
  hasCompetitors: boolean;
  source: "osm" | "none";
  osmMined: number;
  totals: {
    competitors: number;
    branches: number;
    nearestM: number | null;
    densityPerKm2: number | null;
    enriched: number;
    enrichedPct: number;
  };
  branches: BranchHealth[];
  correlationAvailable: boolean;
  health: { level: string; success: number; failed: number; skipped: number } | null;
  dataStatus: string;
}

function fmtDist(m: number | null): string {
  if (m === null) return "—";
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

function healthBadge(level: string | undefined): { label: string; cls: string } {
  switch (level) {
    case "healthy":
      return { label: "Healthy", cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" };
    case "warning":
      return { label: "Warning", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" };
    case "critical":
      return { label: "Critical", cls: "bg-red-500/15 text-red-600 border-red-500/30" };
    default:
      return { label: "No runs yet", cls: "bg-muted text-muted-foreground border-border" };
  }
}

/**
 * Fused "Competitive Health" view.
 *
 * Automatically mines nearby competitors from OpenStreetMap (no manual input,
 * no Google scraper) on first load, then combines discovery totals, nearest
 * competitor, density, enrichment status, correlation readiness and last-run
 * health into a single at-a-glance panel.
 */
export default function CompetitiveHealthFeature() {
  const [health, setHealth] = React.useState<HealthResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [discovering, setDiscovering] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [autoRan, setAutoRan] = React.useState(false);

  const loadHealth = React.useCallback(async (): Promise<HealthResponse> => {
    const res = await fetch("/api/competitive-health", { cache: "no-store" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || j.detail || `failed (${res.status})`);
    }
    return res.json();
  }, []);

  const runDiscovery = React.useCallback(async () => {
    setDiscovering(true);
    try {
      await fetch("/api/competitors/discover?persist=1", { method: "POST" }).catch(() => {});
      setHealth(await loadHealth());
    } finally {
      setDiscovering(false);
    }
  }, [loadHealth]);

  React.useEffect(() => {
    (async () => {
      try {
        setError(null);
        let h = await loadHealth();
        // Automatic discovery the first time the business has no competitors.
        if (!h.hasCompetitors && !autoRan) {
          setAutoRan(true);
          setDiscovering(true);
          await fetch("/api/competitors/discover?persist=1", { method: "POST" }).catch(() => {});
          setDiscovering(false);
          h = await loadHealth();
        }
        setHealth(h);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [loadHealth, autoRan]);

  if (loading && !health) {
    return (
      <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 sm:p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 sm:p-6">
        <h2 className="text-lg font-semibold">Competitive Health</h2>
        <EmptyState
          icon={Activity}
          title="Couldn't load competitive health"
          description={error}
        />
      </div>
    );
  }

  const h = health;
  const badge = healthBadge(h?.health?.level);

  const kpis = [
    {
      icon: Users,
      label: "Competitors found",
      value: String(h?.totals.competitors ?? 0),
      sub: `across ${h?.totals.branches ?? 0} branch${(h?.totals.branches ?? 0) === 1 ? "" : "es"}`,
    },
    {
      icon: MapPin,
      label: "Nearest competitor",
      value: fmtDist(h?.totals.nearestM ?? null),
      sub: h?.source === "osm" ? "from your branch" : "run discovery",
    },
    {
      icon: Radar,
      label: "Density",
      value: h?.totals.densityPerKm2 != null ? `${h.totals.densityPerKm2}/km²` : "—",
      sub: "competitors per km²",
    },
    {
      icon: Network,
      label: "Google-linked",
      value: `${h?.totals.enrichedPct ?? 0}%`,
      sub: `${h?.totals.enriched ?? 0} of ${h?.totals.competitors ?? 0} enriched`,
    },
  ];

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Competitive Health</h2>
          <p className="text-sm text-muted-foreground">
            Automatic OSM discovery fused with correlation readiness and run health.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={runDiscovery}
          disabled={discovering}
          className="shrink-0"
        >
          {discovering ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Re-run discovery
        </Button>
      </div>

      {discovering && (
        <p className="text-xs text-muted-foreground">
          Mining OpenStreetMap for nearby competitors…
        </p>
      )}

      {h?.source === "osm" && (
        <Badge variant="outline" className="w-fit bg-emerald-500/10 text-emerald-600">
          Sourced from OpenStreetMap · no scraping required
        </Badge>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label} className="gbp-card-hover">
              <CardContent className="flex flex-col gap-1 p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Icon className="size-4 text-primary" />
                  {k.label}
                </div>
                <div className="text-2xl font-semibold tabular-nums">{k.value}</div>
                <div className="text-xs text-muted-foreground">{k.sub}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="gbp-card-hover">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="size-4 text-primary" aria-hidden="true" />
            Per-branch intelligence
          </CardTitle>
          <CardDescription>
            Discovery coverage and enrichment status for each monitored branch.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {(h?.branches ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No branches configured yet.</p>
          )}
          {(h?.branches ?? []).map((b) => (
            <div
              key={b.branch_id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm"
            >
              <span className="font-medium">{b.branch_name}</span>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{b.competitorCount} competitors</span>
                <span aria-hidden>·</span>
                <span>nearest {fmtDist(b.nearestM)}</span>
                {b.densityPerKm2 != null && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{b.densityPerKm2}/km²</span>
                  </>
                )}
                {b.enriched > 0 && (
                  <Badge variant="outline" className="text-[10px]">
                    {b.enriched} linked
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline" className={badge.cls}>
          {badge.label}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {h?.correlationAvailable
            ? "Rating correlation is ready (2+ competitors with reviews)."
            : "Collect reviews to enable rating correlation."}
        </span>
      </div>
    </div>
  );
}
