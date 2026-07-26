"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Activity,
  Bell,
  Columns3,
  LayoutDashboard,
  MessageSquare,
  ScrollText,
  Settings2,
  Store,
} from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { Header } from "@/components/dashboard/header";
import { Footer } from "@/components/dashboard/footer";
import { OverviewSection } from "@/components/dashboard/overview-section";
import { BranchesSection } from "@/components/dashboard/branches-section";
import { BranchComparisonSection } from "@/components/dashboard/branch-comparison-section";
import { ReviewsSection } from "@/components/dashboard/reviews-section";
import { LogsSection } from "@/components/dashboard/logs-section";
import { ConfigSection } from "@/components/dashboard/config-section";
import { AlertsSection } from "@/components/dashboard/alerts-section";
import { ShortcutsHelpDialog } from "@/components/dashboard/shortcuts-help-dialog";
import { ExportDashboardDialog } from "@/components/dashboard/export-dashboard-dialog";
import { useAppMode } from "@/hooks/use-app-mode";
import type { TextMap } from "@/lib/app-mode";

import type {
  BranchesResponse,
  OverviewResponse,
  RunSummary,
  ScrapeTriggerErrorResponse,
  ScrapeTriggerAsyncResponse,
  ScrapeTriggerResponse,
  SelectorsConfig,
  VerifiedBy,
} from "@/lib/gbp/types";

type TabValue =
  | "overview"
  | "branches"
  | "compare"
  | "reviews"
  | "alerts"
  | "logs"
  | "config";

const TABS: { value: TabValue; label: string; icon: typeof Activity; description: string }[] = [
  {
    value: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    description: "KPIs, last-run health, and aggregate charts.",
  },
  {
    value: "branches",
    label: "Branches",
    icon: Store,
    description: "6 branches × 2 competitors, expandable per branch.",
  },
  {
    value: "compare",
    label: "Compare",
    icon: Columns3,
    description: "Side-by-side branch cards for at-a-glance comparison.",
  },
  {
    value: "reviews",
    label: "Reviews",
    icon: MessageSquare,
    description: "Searchable, sortable, paginated review table.",
  },
  {
    value: "alerts",
    label: "Alerts",
    icon: Bell,
    description: "System alerts: failures, new reviews, selector issues.",
  },
  {
    value: "logs",
    label: "Run Logs",
    icon: ScrollText,
    description: "Live tail of data/run.log.",
  },
  {
    value: "config",
    label: "Config",
    icon: Settings2,
    description: "Edit monitored competitors, branches, place IDs.",
  },
];

export default function Home() {
  const { mode, T } = useAppMode();
  const [tab, setTab] = React.useState<TabValue>("overview");

  // Filter tabs based on mode — Client mode hides Run Logs + Config
  const visibleTabs = React.useMemo(
    () =>
      TABS.filter((t) => {
        if (t.value === "logs" && !T.showRunLogsTab) return false;
        if (t.value === "config" && !T.showConfigTab) return false;
        return true;
      }),
    [T.showRunLogsTab, T.showConfigTab],
  );

  // ── Data state ─────────────────────────────────────────────────────────
  const [overview, setOverview] = React.useState<OverviewResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = React.useState(true);
  const [overviewError, setOverviewError] = React.useState<string | null>(null);

  const [branches, setBranches] = React.useState<BranchesResponse | null>(null);
  const [branchesLoading, setBranchesLoading] = React.useState(true);
  const [branchesError, setBranchesError] = React.useState<string | null>(null);

  const [selectorVerification, setSelectorVerification] = React.useState<{
    verified_by: VerifiedBy;
    last_verified: string;
  } | null>(null);

  // ── Refresh signal — bumped after a manual scrape so all sections refetch ─
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [isRunning, setIsRunning] = React.useState(false);
  const [runProgress, setRunProgress] = React.useState<{
    completed: number;
    total: number;
    elapsed: number;
  } | null>(null);

  // ── Auto-refresh (Overview tab) — opt-in, 30s interval ──────────────────
  const AUTO_REFRESH_SECONDS = 30;
  const [autoRefresh, setAutoRefresh] = React.useState(false);

  // ── Page visibility tracking — auto-refresh pauses when tab is hidden ──
  const [pageVisible, setPageVisible] = React.useState(true);
  React.useEffect(() => {
    const onVis = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    onVis();
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // ── Fetchers ───────────────────────────────────────────────────────────
  const fetchOverview = React.useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const r = await fetch("/api/overview", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = (await r.json()) as OverviewResponse;
      setOverview(json);
      setSelectorVerification({
        verified_by: json.selectorVerification.verified_by,
        last_verified: json.selectorVerification.last_verified,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setOverviewError(msg);
      toast.error("Couldn't load overview", { description: msg });
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const fetchBranches = React.useCallback(async () => {
    setBranchesLoading(true);
    setBranchesError(null);
    try {
      const r = await fetch("/api/branches", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = (await r.json()) as BranchesResponse;
      setBranches(json);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setBranchesError(msg);
    } finally {
      setBranchesLoading(false);
    }
  }, []);

  // Fetch selectors on mount (for the footer badge even before overview loads).
  React.useEffect(() => {
    fetch("/api/config/selectors", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return null;
        return r.json() as Promise<SelectorsConfig>;
      })
      .then((s) => {
        if (s) {
          setSelectorVerification({
            verified_by: s.verified_by ?? (s as Record<string, unknown>)._health?.["verified_by"] as VerifiedBy ?? "seed",
            last_verified: s.last_verified ?? (s as Record<string, unknown>)._health?.["last_verified"] as string ?? "unknown",
          });
        }
      })
      .catch(() => {
        /* best-effort */
      });
  }, []);

  // Initial loads.
  React.useEffect(() => {
    fetchOverview();
    fetchBranches();
  }, [fetchOverview, fetchBranches, refreshKey]);

  // Auto-refresh: when enabled, poll /api/overview every AUTO_REFRESH_SECONDS.
  // Only runs when (a) the user is on the Overview tab AND (b) the page is
  // visible — pauses when the user switches to another tab/window to avoid
  // wasted requests (Page Visibility API).
  React.useEffect(() => {
    if (!autoRefresh) return;
    if (tab !== "overview") return;
    if (!pageVisible) return;
    const id = setInterval(() => {
      fetchOverview();
    }, AUTO_REFRESH_SECONDS * 1000);
    return () => clearInterval(id);
  }, [autoRefresh, tab, pageVisible, fetchOverview]);

  // ── Manual update trigger (renamed from "scrape" for client mode) ──────
  const handleRunNow = React.useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    setRunProgress(null);
    const toastId = toast.loading(T.runToastLoading, {
      description: T.runToastDesc,
    });
    let runId: string | null = null;
    try {
      const r = await fetch("/api/scrape/trigger", {
        method: "POST",
        cache: "no-store",
      });
      if (!r.ok) {
        const err = (await r.json()) as ScrapeTriggerErrorResponse;
        throw new Error(err.error || `HTTP ${r.status}`);
      }
      const json = (await r.json()) as ScrapeTriggerAsyncResponse;
      runId = json.runId;

      // Poll for completion
      let summary: RunSummary | null = null;
      let pollError: string | null = null;
      const pollInterval = setInterval(async () => {
        try {
          const sr = await fetch(`/api/scrape/status?runId=${runId}`, {
            cache: "no-store",
          });
          if (!sr.ok) return;
          const data = await sr.json();
          setRunProgress({
            completed: data.progress.completed,
            total: data.progress.total,
            elapsed: data.elapsed,
          });
          if (data.status === "completed") {
            clearInterval(pollInterval);
            summary = data.summary;
            setIsRunning(false);
            setRunProgress(null);
            toast.success(T.runToastSuccess, {
              id: toastId,
              description: `+${data.summary.new_reviews} new review${
                data.summary.new_reviews === 1 ? "" : "s"
              } · ${data.summary.success} ok · ${data.summary.failed} failed · ${
                data.summary.skipped
              } skipped${data.summary.skipped > 0 ? " (no fixtures)" : ""}`,
            });
            setRefreshKey((k) => k + 1);
            fetchOverview();
            fetchBranches();
            if (data.summary.failed > 0 && data.summary.failed >= data.summary.success) {
              toast.error("Update alert: some data couldn't be refreshed", {
                description: `${data.summary.failed} of ${
                  data.summary.success + data.summary.failed
                } sources had issues.${T.showRunLogsTab ? " Check the Run Logs tab." : ""}`,
              });
            }
          } else if (data.status === "failed") {
            clearInterval(pollInterval);
            setIsRunning(false);
            setRunProgress(null);
            toast.error("Update failed", {
              id: toastId,
              description: data.error || "Unknown error",
            });
          }
        } catch {
          // ignore polling errors, keep retrying
        }
      }, 1_500);
    } catch (e) {
      setIsRunning(false);
      setRunProgress(null);
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Update failed", { id: toastId, description: msg });
    }
  }, [isRunning, fetchOverview, fetchBranches, T]);

  // Keyboard shortcuts: gmail-style two-key "g <letter>" sequences.
  //   g r → Run Now (scrape trigger)
  //   g o → Overview tab
  //   g b → Branches tab
  //   g m → Compare tab (m for "coMpare" — c is taken by Config)
  //   g v → Reviews tab (v for "reViews" — r is taken by Run Now)
  //   g l → Run Logs tab
  //   g c → Config tab
  //   ?   → Show keyboard shortcuts help dialog
  // Disabled when the user is typing in an input/textarea/select/contenteditable.
  // The first key "g" must be followed by the second key within 800ms.
  const SHORTCUT_TAB_MAP: Record<string, TabValue> = {
    o: "overview",
    b: "branches",
    m: "compare",
    v: "reviews",
    a: "alerts",
    l: "logs",
    c: "config",
  };
  const [showShortcutsHelp, setShowShortcutsHelp] = React.useState(false);
  const [showExportDialog, setShowExportDialog] = React.useState(false);
  React.useEffect(() => {
    let firstKey: "g" | null = null;
    let resetTimer: ReturnType<typeof setTimeout> | null = null;
    const isTypingTarget = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
    };
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      // "?" key opens the shortcuts help dialog
      if (key === "?" || (key === "/" && e.shiftKey)) {
        e.preventDefault();
        setShowShortcutsHelp((v) => !v);
        return;
      }
      // Escape closes the help dialog
      if (key === "escape") {
        setShowShortcutsHelp(false);
        return;
      }
      if (key === "g") {
        firstKey = "g";
        if (resetTimer) clearTimeout(resetTimer);
        resetTimer = setTimeout(() => {
          firstKey = null;
        }, 800);
        return;
      }
      if (firstKey === "g") {
        firstKey = null;
        if (resetTimer) clearTimeout(resetTimer);
        if (key === "r") {
          e.preventDefault();
          handleRunNow();
          toast.info("Shortcut: Run Now", {
            description: "Triggered by “g” then “r” keyboard sequence.",
            duration: 2000,
          });
          return;
        }
        const tabValue = SHORTCUT_TAB_MAP[key];
        if (tabValue) {
          e.preventDefault();
          setTab(tabValue);
          const label = TABS.find((t) => t.value === tabValue)?.label ?? tabValue;
          toast.info(`Shortcut: ${label} tab`, {
            description: `Triggered by “g” then “${key}” keyboard sequence.`,
            duration: 2000,
          });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (resetTimer) clearTimeout(resetTimer);
    };
  }, [handleRunNow]); // SHORTCUT_TAB_MAP + TABS are module/stable consts

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header
        onRunNow={handleRunNow}
        isRunning={isRunning}
        runProgress={runProgress}
        onShowShortcuts={() => setShowShortcutsHelp(true)}
        onShowExport={() => setShowExportDialog(true)}
        lastRunAt={
          overview?.runSummary?.finished_at ??
          overview?.runSummary?.started_at ??
          null
        }
        T={T}
        mode={mode}
      />

      <main
        className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8"
        aria-label="Rother dashboard"
      >
        {/* Tab navigation */}
        <nav aria-label="Dashboard sections" className="mb-6">
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as TabValue)}
            className="gap-4"
          >
            <div className="overflow-x-auto gbp-scrollbar pb-1">
              <TabsList className="flex h-auto w-max gap-1 bg-muted/60 p-1">
                {visibleTabs.map((t) => {
                  const Icon = t.icon;
                  // Show a count badge on the Reviews tab when we have data.
                  const badgeCount =
                    t.value === "reviews" && overview && overview.totalReviews > 0
                      ? overview.totalReviews
                      : null;
                  return (
                    <TooltipProvider key={t.value} delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <TabsTrigger
                            value={t.value}
                            className="h-9 gap-1.5 px-3 text-sm"
                            aria-label={t.label}
                          >
                            <Icon className="size-4" aria-hidden="true" />
                            <span className="hidden sm:inline">{t.label}</span>
                            <span className="sm:sr-only">{t.label}</span>
                            {badgeCount !== null && (
                              <span
                                className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold tabular-nums text-primary"
                                aria-label={`${badgeCount} reviews`}
                              >
                                {badgeCount > 999 ? "999+" : badgeCount}
                              </span>
                            )}
                          </TabsTrigger>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs">
                          <p className="font-semibold">{t.label}</p>
                          <p className="text-xs opacity-90">{t.description}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })}
              </TabsList>
            </div>

            <TabsContent value="overview" className="mt-0 focus-visible:outline-none">
              <OverviewSection
                data={overview}
                loading={overviewLoading}
                error={overviewError}
                onRefresh={fetchOverview}
                autoRefresh={autoRefresh}
                onToggleAutoRefresh={() => setAutoRefresh((v) => !v)}
                autoRefreshSeconds={AUTO_REFRESH_SECONDS}
                refreshKey={refreshKey}
                T={T}
              />
            </TabsContent>

            <TabsContent value="branches" className="mt-0 focus-visible:outline-none">
              <BranchesSection
                data={branches}
                loading={branchesLoading}
                error={branchesError}
                refreshKey={refreshKey}
              />
            </TabsContent>

            <TabsContent value="compare" className="mt-0 focus-visible:outline-none">
              <BranchComparisonSection
                data={branches}
                loading={branchesLoading}
                error={branchesError}
                refreshKey={refreshKey}
              />
            </TabsContent>

            <TabsContent value="reviews" className="mt-0 focus-visible:outline-none">
              <ReviewsSection refreshKey={refreshKey} />
            </TabsContent>

            <TabsContent value="alerts" className="mt-0 focus-visible:outline-none">
              <AlertsSection refreshKey={refreshKey} />
            </TabsContent>

            <TabsContent value="logs" className="mt-0 focus-visible:outline-none">
              <LogsSection />
            </TabsContent>

            <TabsContent value="config" className="mt-0 focus-visible:outline-none">
              <ConfigSection refreshKey={refreshKey} />
            </TabsContent>
          </Tabs>
        </nav>
      </main>

      <Footer
        verifiedBy={selectorVerification?.verified_by ?? null}
        lastVerified={selectorVerification?.last_verified ?? null}
        health={
          overview?.runSummary
            ? {
                success: overview.runSummary.success,
                failed: overview.runSummary.failed,
                skipped: overview.runSummary.skipped,
                lastRunAt:
                  overview.runSummary.finished_at ??
                  overview.runSummary.started_at,
              }
            : null
        }
        T={T}
        mode={mode}
      />

      {/* Keyboard shortcuts help dialog — opens via "?" key or the header button */}
      <ShortcutsHelpDialog
        open={showShortcutsHelp}
        onOpenChange={setShowShortcutsHelp}
      />

      {/* Data export dashboard dialog — opens via the header export button */}
      <ExportDashboardDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        totalReviews={overview?.totalReviews ?? 0}
        totalRuns={overview?.runSummary ? 1 : 0}
        totalCompetitors={overview?.totalCompetitors ?? 0}
        totalBranches={overview?.totalBranches ?? 0}
      />
    </div>
  );
}
