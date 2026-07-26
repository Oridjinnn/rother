"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { EmptyState } from "./empty-state";
import type { Alert, AlertType, AlertSeverity, AlertsResponse } from "@/lib/gbp/types";

interface AlertsSectionProps {
  refreshKey?: number;
}

const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  new_reviews: "New Reviews",
  rating_drop: "Rating Drop",
  scrape_failure: "Scrape Failure",
  run_failure: "Run Failure",
  selector_degradation: "Selector Issue",
  large_review_increase: "Review Spike",
};

const ALERT_TYPE_ICONS: Record<AlertType, typeof Bell> = {
  new_reviews: Sparkles,
  rating_drop: TrendingUp,
  scrape_failure: AlertTriangle,
  run_failure: AlertTriangle,
  selector_degradation: AlertTriangle,
  large_review_increase: TrendingUp,
};

const ALERT_TYPE_OPTIONS: { value: AlertType | "all"; label: string }[] = [
  { value: "all", label: "All types" },
  ...(Object.entries(ALERT_TYPE_LABELS) as [AlertType, string][]).map(
    ([value, label]) => ({ value, label }),
  ),
];

const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  info: "Info",
  warning: "Warning",
  error: "Error",
};

const SEVERITY_COLORS: Record<AlertSeverity, string> = {
  info: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  warning:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  error: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
};

const SEVERITY_DOT: Record<AlertSeverity, string> = {
  info: "bg-blue-500",
  warning: "bg-amber-500",
  error: "bg-red-500",
};

export function AlertsSection({ refreshKey }: AlertsSectionProps) {
  const [alerts, setAlerts] = React.useState<Alert[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [typeFilter, setTypeFilter] = React.useState<AlertType | "all">("all");
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());

  const fetchAlerts = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/alerts", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = (await r.json()) as AlertsResponse;
      setAlerts(json.alerts);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAlerts();
  }, [fetchAlerts, refreshKey]);

  const filtered = alerts.filter((a) => {
    if (typeFilter !== "all" && a.type !== typeFilter) return false;
    if (dismissed.has(a.id)) return false;
    return true;
  });

  const errorCount = filtered.filter((a) => a.severity === "error").length;
  const warningCount = filtered.filter((a) => a.severity === "warning").length;

  const dismissAll = () => {
    setDismissed(new Set(filtered.map((a) => a.id)));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="space-y-4"
    >
      <Card className="gbp-card-hover bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1 min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="size-4 text-primary" aria-hidden="true" />
                Alerts
              </CardTitle>
              <CardDescription>
                {alerts.length === 0
                  ? "No alerts — everything looks healthy."
                  : `${alerts.length} alert${alerts.length === 1 ? "" : "s"} · ${errorCount} error${errorCount === 1 ? "" : "s"} · ${warningCount} warning${warningCount === 1 ? "" : "s"}`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchAlerts}
                disabled={loading}
                className="gap-1.5"
                aria-label="Refresh alerts"
              >
                <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={dismissAll}
                disabled={filtered.length === 0}
                className="gap-1.5 text-muted-foreground"
              >
                <X className="size-3.5" />
                Dismiss all
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Filter
              </label>
              <Select
                value={typeFilter}
                onValueChange={(v) => setTypeFilter(v as AlertType | "all")}
              >
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALERT_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {filtered.length > 0 && (
              <span className="text-xs text-muted-foreground pt-5">
                Showing {filtered.length} of {alerts.length - dismissed.size} active
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't load alerts"
          description={error}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="All clear"
          description={
            dismissed.size > 0
              ? `${dismissed.size} alert${dismissed.size === 1 ? "" : "s"} dismissed. Refresh to see new alerts.`
              : "No alerts to show. Everything is running smoothly."
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((alert, idx) => {
            const Icon = ALERT_TYPE_ICONS[alert.type] ?? Bell;
            return (
              <motion.div
                key={alert.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
              >
                <Card
                  className={`gbp-card-hover relative overflow-hidden border-l-4 ${SEVERITY_COLORS[alert.severity]}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <span
                          className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${SEVERITY_COLORS[alert.severity]}`}
                        >
                          <Icon className="size-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-foreground">
                              {alert.title}
                            </span>
                            <Badge
                              variant="outline"
                              className="px-1.5 py-0 text-[10px] font-medium uppercase tracking-wide"
                            >
                              {ALERT_TYPE_LABELS[alert.type]}
                            </Badge>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide ${SEVERITY_COLORS[alert.severity]}`}
                            >
                              <span className={`size-1.5 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                              {SEVERITY_LABELS[alert.severity]}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {alert.description}
                          </p>
                          {alert.detail && (
                            <p className="text-xs text-muted-foreground/70 mt-0.5">
                              {alert.detail}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                            <span>{new Date(alert.timestamp).toLocaleString()}</span>
                            <span className="uppercase tracking-wider">
                              {alert.source}
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setDismissed((prev) => new Set(prev).add(alert.id))
                        }
                        className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                        aria-label="Dismiss alert"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
