"use client";

import * as React from "react";
import { Activity } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface HealthPoint {
  success: number;
  failed: number;
  skipped: number;
  timestamp: string;
  level: "healthy" | "warning" | "critical" | "unknown";
}

interface HealthSparklineProps {
  /** Polling interval in ms. Default 60s. */
  pollMs?: number;
  className?: string;
}

const LEVEL_COLORS: Record<HealthPoint["level"], string> = {
  healthy: "oklch(0.55 0.13 165)", // emerald
  warning: "oklch(0.70 0.15 75)", // amber
  critical: "oklch(0.58 0.22 27)", // red
  unknown: "oklch(0.65 0.10 200)", // muted teal
};

/**
 * A tiny sparkline showing the scraper's recent run health trend.
 * Each run is a 4px-wide vertical bar, colored by its health level
 * (green=healthy, amber=warning, red=critical). Max 20 bars.
 *
 * Self-fetches from /api/health-trend every 60s. Hidden on mobile
 * (the footer is already crowded on small screens).
 */
export function HealthSparkline({
  pollMs = 60_000,
  className,
}: HealthSparklineProps) {
  const [points, setPoints] = React.useState<HealthPoint[]>([]);
  const [loading, setLoading] = React.useState(true);

  const fetchData = React.useCallback(async () => {
    try {
      const res = await fetch("/api/health-trend", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setPoints(json.points ?? []);
    } catch {
      /* best-effort */
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, pollMs);
    return () => clearInterval(id);
  }, [fetchData, pollMs]);

  if (loading || points.length === 0) {
    // Don't render anything until we have data — keeps the footer clean
    return null;
  }

  const maxTotal = Math.max(
    1,
    ...points.map((p) => p.success + p.failed + p.skipped),
  );

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={
              "hidden items-center gap-1.5 rounded-md border border-border/50 bg-background/60 px-2 py-0.5 text-[11px] text-muted-foreground sm:inline-flex " +
              (className ?? "")
            }
            role="img"
            aria-label={`Scraper health trend: ${points.length} run${points.length === 1 ? "" : "s"} shown`}
          >
            <Activity className="size-3" aria-hidden="true" />
            {/* Sparkline bars */}
            <span className="flex items-end gap-0.5" aria-hidden="true">
              {points.slice(-12).map((p, i) => {
                const total = p.success + p.failed + p.skipped;
                const heightPct = (total / maxTotal) * 100;
                return (
                  <span
                    key={i}
                    className="inline-block w-1 rounded-sm"
                    style={{
                      height: `${Math.max(3, heightPct * 0.2)}px`, // max ~20px tall
                      backgroundColor: LEVEL_COLORS[p.level],
                      opacity: i === points.slice(-12).length - 1 ? 1 : 0.6,
                    }}
                  />
                );
              })}
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="font-semibold">Scraper health trend</p>
          <p className="text-xs opacity-90">
            {points.length} run{points.length === 1 ? "" : "s"} shown · latest:{" "}
            {points[points.length - 1].level}
          </p>
          <div className="mt-1 space-y-0.5 text-[10px] opacity-80">
            <div className="flex items-center gap-1.5">
              <span
                className="size-2 rounded-sm"
                style={{ backgroundColor: LEVEL_COLORS.healthy }}
              />
              healthy = 0 failures
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="size-2 rounded-sm"
                style={{ backgroundColor: LEVEL_COLORS.warning }}
              />
              warning = some failures
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="size-2 rounded-sm"
                style={{ backgroundColor: LEVEL_COLORS.critical }}
              />
              critical = failed ≥ success
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
