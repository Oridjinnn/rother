"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Activity,
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
import { ReviewsSection } from "@/components/dashboard/reviews-section";
import { LogsSection } from "@/components/dashboard/logs-section";
import { ConfigSection } from "@/components/dashboard/config-section";

import type {
  BranchesResponse,
  OverviewResponse,
  RunSummary,
  ScrapeTriggerErrorResponse,
  ScrapeTriggerResponse,
  SelectorsConfig,
  VerifiedBy,
} from "@/lib/gbp/types";

type TabValue =
  | "overview"
  | "branches"
  | "reviews"
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
    value: "reviews",
    label: "Reviews",
    icon: MessageSquare,
    description: "Searchable, sortable, paginated review table.",
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
    description: "Read-only view of listings.json + selectors.json.",
  },
];

export default function Home() {
  const [tab, setTab] = React.useState<TabValue>("overview");

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
            verified_by: s.verified_by,
            last_verified: s.last_verified,
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

  // ── Manual scrape trigger ──────────────────────────────────────────────
  const handleRunNow = React.useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    const toastId = toast.loading("Running scraper (fixtures mode)…", {
      description: "Spawning python3 -m orchestration.run_all --fixtures",
    });
    try {
      const r = await fetch("/api/scrape/trigger", {
        method: "POST",
        cache: "no-store",
      });
      if (!r.ok) {
        const err = (await r.json()) as ScrapeTriggerErrorResponse;
        throw new Error(err.error || `HTTP ${r.status}`);
      }
      const json = (await r.json()) as ScrapeTriggerResponse;
      const summary: RunSummary = json.summary;
      toast.success("Scrape complete", {
        id: toastId,
        description: `+${summary.new_reviews} new review${
          summary.new_reviews === 1 ? "" : "s"
        } · ${summary.success} ok · ${summary.failed} failed · ${
          summary.skipped
        } skipped`,
      });
      // Bump refreshKey so Overview / Branches / Reviews / Config all refetch.
      setRefreshKey((k) => k + 1);
      // Immediate refetch of overview + branches for instant feedback.
      fetchOverview();
      fetchBranches();
      if (summary.failed > 0 && summary.failed >= summary.success) {
        toast.error("Run alert: failed ≥ success", {
          description: `${summary.failed} of ${
            summary.success + summary.failed
          } listings failed. Check the Run Logs tab.`,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Scrape failed", { id: toastId, description: msg });
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, fetchOverview, fetchBranches]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header onRunNow={handleRunNow} isRunning={isRunning} />

      <main
        className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8"
        aria-label="GBP Monitor dashboard"
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
                {TABS.map((t) => {
                  const Icon = t.icon;
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

            <TabsContent value="reviews" className="mt-0 focus-visible:outline-none">
              <ReviewsSection refreshKey={refreshKey} />
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
      />
    </div>
  );
}
