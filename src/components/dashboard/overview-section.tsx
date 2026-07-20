"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  FileText,
  MapPin,
  PieChart,
  Radar as RadarIcon,
  ShieldAlert,
  Sparkles,
  Star,
  Store,
  TrendingUp,
  XCircle,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { KpiCard } from "./kpi-card";
import { StarRating } from "./star-rating";
import {
  CompetitorRadarChart,
  NewReviewsPerBranchChart,
  RatingDistributionChart,
  ReviewsPerCompetitorChart,
  SentimentDistributionChart,
} from "./charts";
import { EmptyState } from "./empty-state";
import { AutoRefreshToggle } from "./auto-refresh-toggle";
import { RunHistoryTimeline } from "./run-history-timeline";
import { ReviewsOverTimeCard } from "./reviews-over-time-card";
import { ReviewLengthsCard } from "./review-lengths-card";
import { CompetitorLeaderboard } from "./competitor-leaderboard";
import { FreshnessBadge } from "./freshness-badge";
import { ReviewRecencyHeatmap } from "./review-recency-heatmap";
import { ReviewWordCloud } from "./review-word-cloud";
import { CompetitorGrowthRate } from "./competitor-growth-rate";
import { RunComparisonCard } from "./run-comparison-card";
import { TopReviewers } from "./top-reviewers";
import { ScrapeSchedule } from "./scrape-schedule";
import { ReviewLanguageDistribution } from "./review-language-distribution";
import { formatTimestamp } from "@/lib/gbp/format";
import type { OverviewResponse } from "@/lib/gbp/types";

interface OverviewSectionProps {
  data: OverviewResponse | null;
  loading: boolean;
  error: string | null;
  /** Called when the user clicks "Refresh" on the health panel. */
  onRefresh?: () => void;
  /** Whether auto-refresh is active (controlled by parent). */
  autoRefresh?: boolean;
  /** Toggle auto-refresh (parent owns the interval). */
  onToggleAutoRefresh?: () => void;
  /** Auto-refresh interval in seconds (for the tooltip label). */
  autoRefreshSeconds?: number;
  /** Bump to force the run-history timeline to refetch. */
  refreshKey?: number;
}

/** Verification badge for the KPI card — pill-shaped, color-coded. */
function VerificationBadge({
  verifiedBy,
  lastVerified,
}: {
  verifiedBy: "seed" | "browser_agent" | "manual_human";
  lastVerified: string;
}) {
  const isUnproven = verifiedBy === "seed";
  return (
    <Badge
      variant="outline"
      className={
        isUnproven
          ? "gap-1 border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300"
          : "gap-1 border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
      }
    >
      {isUnproven ? (
        <ShieldAlert className="size-3" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="size-3" aria-hidden="true" />
      )}
      {verifiedBy}
      <span className="opacity-70">· {lastVerified}</span>
    </Badge>
  );
}

/**
 * "Last Run Health" panel: a stacked bar showing success/failed/skipped
 * proportions, plus an error list when failed > 0.
 */
function RunHealthPanel({
  data,
  onRefresh,
  autoRefresh,
  onToggleAutoRefresh,
  autoRefreshSeconds,
}: {
  data: OverviewResponse;
  onRefresh?: () => void;
  autoRefresh?: boolean;
  onToggleAutoRefresh?: () => void;
  autoRefreshSeconds?: number;
}) {
  const { runSummary } = data;
  if (!runSummary) {
    return (
      <Card className="gbp-card-hover">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="size-4 text-primary" aria-hidden="true" />
            Last Run Health
          </CardTitle>
          <CardDescription>
            No runs yet. Click “Run Now” in the header to trigger a fixtures-mode scrape.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const total = runSummary.success + runSummary.failed + runSummary.skipped;
  const successPct = total === 0 ? 0 : (runSummary.success / total) * 100;
  const failedPct = total === 0 ? 0 : (runSummary.failed / total) * 100;
  const skippedPct = total === 0 ? 0 : (runSummary.skipped / total) * 100;
  const ts = formatTimestamp(runSummary.finished_at ?? runSummary.started_at);

  return (
    <Card className="gbp-card-hover">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <Activity className="size-4 text-primary" aria-hidden="true" />
              Last Run Health
              {data.isAlert ? (
                <Badge
                  variant="destructive"
                  className="gap-1 px-2 py-0.5 text-[11px] font-semibold"
                >
                  <AlertTriangle className="size-3" aria-hidden="true" />
                  ALERT: failed ≥ success
                </Badge>
              ) : runSummary.failed > 0 ? (
                <Badge
                  variant="outline"
                  className="gap-1 border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300"
                >
                  <AlertTriangle className="size-3" aria-hidden="true" />
                  {runSummary.failed} failed
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="gap-1 border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300"
                >
                  <CheckCircle2 className="size-3" aria-hidden="true" />
                  Healthy
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" aria-hidden="true" />
                {ts.relative}
              </span>
              <span className="text-border">·</span>
              <span className="font-mono text-[11px]">{ts.absolute}</span>
              <span className="text-border">·</span>
              <span className="inline-flex items-center gap-1">
                <Sparkles className="size-3 text-amber-500" aria-hidden="true" />
                mode: {runSummary.mode}
              </span>
            </CardDescription>
          </div>
          {onRefresh && (
            <div className="flex items-center gap-2">
              {onToggleAutoRefresh && (
                <AutoRefreshToggle
                  active={!!autoRefresh}
                  onToggle={onToggleAutoRefresh}
                  intervalSeconds={autoRefreshSeconds ?? 30}
                />
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={onRefresh}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Refresh
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stacked proportion bar */}
        <div className="space-y-2">
          <div
            className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={`Run health: ${runSummary.success} success, ${runSummary.failed} failed, ${runSummary.skipped} skipped`}
          >
            <div
              className="bg-emerald-500 transition-all duration-500"
              style={{ width: `${successPct}%` }}
              title={`${runSummary.success} success`}
            />
            <div
              className="bg-destructive transition-all duration-500"
              style={{ width: `${failedPct}%` }}
              title={`${runSummary.failed} failed`}
            />
            <div
              className="bg-muted-foreground/40 transition-all duration-500"
              style={{ width: `${skippedPct}%` }}
              title={`${runSummary.skipped} skipped`}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
              <span className="size-2 rounded-full bg-emerald-500" />
              <CheckCircle2 className="size-3" aria-hidden="true" />
              <span className="font-semibold tabular-nums">{runSummary.success}</span>
              <span className="text-muted-foreground">success</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-destructive">
              <span className="size-2 rounded-full bg-destructive" />
              <XCircle className="size-3" aria-hidden="true" />
              <span className="font-semibold tabular-nums">{runSummary.failed}</span>
              <span className="text-muted-foreground">failed</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-full bg-muted-foreground/40" />
              <span className="font-semibold tabular-nums">{runSummary.skipped}</span>
              <span>skipped</span>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help underline decoration-dotted underline-offset-2">
                      (?)
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Skipped = no fixture (fixtures mode) or URL unreachable (live
                    mode). Not a failure.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </span>
          </div>
        </div>

        {/* Errors list */}
        {runSummary.errors.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Errors ({runSummary.errors.length})
            </h4>
            <div className="max-h-44 space-y-2 overflow-y-auto gbp-scrollbar rounded-md border border-border/60 bg-muted/30 p-2">
              {runSummary.errors.map((err, i) => (
                <div
                  key={`${err.competitor_id}-${i}`}
                  className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-1.5 font-mono font-semibold text-destructive">
                    <XCircle className="size-3" aria-hidden="true" />
                    {err.competitor_id}
                  </div>
                  <div className="mt-0.5 text-destructive/80 break-words">
                    {err.error}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Aggregate stats footer */}
        <div className="grid grid-cols-2 gap-3 border-t border-border/60 pt-3 sm:grid-cols-4">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              New reviews
            </div>
            <div className="text-lg font-bold tabular-nums text-amber-600 dark:text-amber-400">
              +{runSummary.new_reviews}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Total reviews
            </div>
            <div className="text-lg font-bold tabular-nums text-foreground">
              {runSummary.total_reviews}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Duration
            </div>
            <div className="text-lg font-bold tabular-nums text-foreground">
              {runSummary.finished_at
                ? `${(
                    new Date(runSummary.finished_at).getTime() -
                    new Date(runSummary.started_at).getTime()
                  ).toFixed(0)}ms`
                : "—"}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Listings
            </div>
            <div className="text-lg font-bold tabular-nums text-foreground">
              {total}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** A small chart-card wrapper with consistent header + skeleton state. */
function ChartCard({
  title,
  icon: Icon,
  description,
  children,
  loading,
  skeletonHeight = 260,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  children: React.ReactNode;
  loading?: boolean;
  skeletonHeight?: number;
}) {
  return (
    <Card className="gbp-card-hover">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4 text-primary" aria-hidden="true" />
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton
            className="w-full rounded-md"
            style={{ height: skeletonHeight }}
          />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

export function OverviewSection({
  data,
  loading,
  error,
  onRefresh,
  autoRefresh,
  onToggleAutoRefresh,
  autoRefreshSeconds,
  refreshKey,
}: OverviewSectionProps) {
  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Couldn't load overview"
        description={error}
      />
    );
  }

  if (!data) return null;

  const ts = formatTimestamp(
    data.runSummary?.finished_at ?? data.runSummary?.started_at,
  );
  const hasReviews = data.totalReviews > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="space-y-6"
    >
      {/* UNPROVEN banner — only when selectors are seed */}
      {data.selectorVerification.isUnproven && (
        <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200">
          <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <AlertTitle className="text-amber-800 dark:text-amber-200">
            Selectors are UNPROVEN (seed only)
          </AlertTitle>
          <AlertDescription className="text-amber-700/90 dark:text-amber-300/90">
            The scraper selectors in <code className="font-mono">config/selectors.json</code> have not
            been verified against the live Google Maps DOM. Live-mode runs will
            likely fail with <code className="font-mono">SelectorNotFoundError</code> until a
            browser_agent verification pass updates them. Fixtures mode is unaffected.
          </AlertDescription>
        </Alert>
      )}

      {/* Run alert — when failed ≥ success */}
      {data.isAlert && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertTitle>Run alert: failed ≥ success</AlertTitle>
          <AlertDescription>
            The last run had {data.runSummary?.failed} failure(s) out of{" "}
            {data.runSummary
              ? data.runSummary.success + data.runSummary.failed
              : 0}{" "}
            attempted listing(s). Possible selector breakage — check{" "}
            <code className="font-mono">config/selectors.json</code> and the Run Logs tab.
          </AlertDescription>
        </Alert>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Branches"
          value={data.totalBranches}
          icon={Building2}
          accent="primary"
          hint="Copenhagen Bali locations"
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
          label="New (Last Run)"
          value={`+${data.newReviewsLastRun}`}
          icon={TrendingUp}
          accent="amber"
          hint="From latest deltas"
        />
        <KpiCard
          label="Last Run"
          value={
            <span className="text-base font-bold leading-tight">
              {ts.relative}
            </span>
          }
          icon={Clock}
          accent="teal"
          hint={
            <span className="font-mono text-[10px]">{ts.absolute}</span>
          }
        />
        <Card className="gbp-card-hover relative overflow-hidden py-0">
          <CardContent className="flex items-start justify-between gap-3 p-5">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Selector Verification
              </span>
              <div className="mt-1">
                <VerificationBadge
                  verifiedBy={data.selectorVerification.verified_by}
                  lastVerified={data.selectorVerification.last_verified}
                />
              </div>
              <span className="mt-1 text-[10px] text-muted-foreground leading-tight">
                {data.selectorVerification.isUnproven
                  ? "Needs browser_agent pass"
                  : "Verified against live DOM"}
              </span>
            </div>
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/15 to-amber-500/5 text-amber-600 dark:text-amber-400"
              aria-hidden="true"
            >
              {data.selectorVerification.isUnproven ? (
                <ShieldAlert className="size-5" />
              ) : (
                <CheckCircle2 className="size-5" />
              )}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Run health panel + Scrape schedule — side-by-side on lg+ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RunHealthPanel
          data={data}
          onRefresh={onRefresh}
          autoRefresh={autoRefresh}
          onToggleAutoRefresh={onToggleAutoRefresh}
          autoRefreshSeconds={autoRefreshSeconds}
        />
        <ScrapeSchedule />
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Rating Distribution"
          icon={Star}
          description="Star ratings across all monitored reviews (1★–5★)"
          loading={loading}
          skeletonHeight={260}
        >
          {hasReviews ? (
            <RatingDistributionChart data={data.ratingDistribution} />
          ) : (
            <EmptyState
              icon={Star}
              title="No ratings yet"
              description="The scraper hasn't produced any snapshots. Click “Run Now” to trigger a fixtures-mode scrape."
              className="h-[260px]"
            />
          )}
        </ChartCard>

        <ChartCard
          title="Reviews per Competitor"
          icon={Store}
          description="Total reviews by competitor — top 12 shown"
          loading={loading}
          skeletonHeight={320}
        >
          {hasReviews ? (
            <ReviewsPerCompetitorChart data={data.competitorStats} />
          ) : (
            <EmptyState
              icon={Store}
              title="No competitor data"
              description="Run the scraper to populate per-competitor review counts."
              className="h-[320px]"
            />
          )}
        </ChartCard>
      </div>

      {/* Second charts grid: Sentiment donut + New reviews per branch */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Sentiment Distribution"
          icon={PieChart}
          description="Rating-based sentiment buckets (★4–5 positive · ★3 neutral · ★1–2 negative). No AI/LLM — heuristic only."
          loading={loading}
          skeletonHeight={260}
        >
          {hasReviews ? (
            <SentimentDistributionChart data={data.ratingDistribution} />
          ) : (
            <EmptyState
              icon={PieChart}
              title="No sentiment data yet"
              description="Run the scraper to populate the sentiment breakdown."
              className="h-[260px]"
            />
          )}
        </ChartCard>

        <ChartCard
          title="New Reviews per Branch"
          icon={MapPin}
          description="New reviews detected in the latest run, grouped by Copenhagen Bali branch"
          loading={loading}
          skeletonHeight={260}
        >
          {data.newReviewsPerBranch.some((b) => b.count > 0) ? (
            <NewReviewsPerBranchChart data={data.newReviewsPerBranch} />
          ) : (
            <EmptyState
              icon={TrendingUp}
              title="No new reviews"
              description="The last run found no new reviews. Run the scraper again to detect deltas."
              className="h-[260px]"
            />
          )}
        </ChartCard>
      </div>

      {/* Reviews count over time — full-width area chart */}
      <ReviewsOverTimeCard refreshKey={refreshKey} />

      {/* Review text length distribution — full-width bar chart */}
      <ReviewLengthsCard refreshKey={refreshKey} />

      {/* Review word cloud — text-based word frequency visualization */}
      <ReviewWordCloud refreshKey={refreshKey} />

      {/* Snapshot at a Glance + Competitor Leaderboard — side-by-side on lg+ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Quick recent-reviews preview (a taste of the Reviews tab) */}
        {hasReviews && data.competitorStats.length > 0 && (
          <Card className="gbp-card-hover">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="size-4 text-primary" aria-hidden="true" />
                Snapshot at a Glance
              </CardTitle>
              <CardDescription>
                Per-competitor review counts and average ratings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {data.competitorStats
                  .filter((c) => c.total_reviews > 0)
                  .map((c) => (
                    <div
                      key={c.competitor_id}
                      className="rounded-lg border border-border/60 bg-muted/30 p-3 transition-colors hover:border-primary/30 hover:bg-primary/5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-foreground">
                            {c.name}
                          </div>
                          <div className="truncate text-[11px] text-muted-foreground">
                            {c.branch_name}
                          </div>
                        </div>
                        {c.new_reviews_count > 0 && (
                          <Badge className="shrink-0 gap-1 border-amber-500/40 bg-amber-500/15 px-1.5 py-0 text-[10px] font-semibold text-amber-700 dark:text-amber-300" variant="outline">
                            +{c.new_reviews_count}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <StarRating rating={c.average_rating} size="sm" />
                        <FreshnessBadge lastScrapedAt={c.last_scraped_at} />
                        <span className="ml-auto text-xs font-medium tabular-nums text-muted-foreground">
                          {c.total_reviews} review{c.total_reviews === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>
                  ))}
                {data.competitorStats.filter((c) => c.total_reviews > 0).length ===
                  0 && (
                  <div className="col-span-full text-center text-sm text-muted-foreground py-6">
                    No competitors have reviews yet.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Competitor Leaderboard — sortable ranked list */}
        <CompetitorLeaderboard
          data={data.competitorStats}
          loading={loading}
        />
      </div>

      {/* Competitor comparison radar chart — top 3 competitors across 4
          normalized dimensions (Reviews, Rating, New, Recency). Full-width. */}
      <ChartCard
        title="Competitor Comparison"
        icon={RadarIcon}
        description="Top 3 competitors compared across normalized dimensions (0–100). Reviews, Rating, New, and Recency (7-day decay)."
        loading={loading}
        skeletonHeight={320}
      >
        {hasReviews ? (
          <CompetitorRadarChart data={data.competitorStats} topN={3} />
        ) : (
          <EmptyState
            icon={RadarIcon}
            title="No competitor data yet"
            description="Run the scraper to populate the competitor comparison."
            className="h-[320px]"
          />
        )}
      </ChartCard>

      {/* Run comparison — diff two runs side-by-side */}
      <RunComparisonCard refreshKey={refreshKey} />

      {/* Run history timeline — newest-first list of every run that produced
          new reviews. Auto-polls every 30s. */}
      <RunHistoryTimeline refreshKey={refreshKey} />

      {/* Review recency heatmap + Competitor growth rate — side-by-side on lg+ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Review recency heatmap — GitHub-style contribution graph */}
        <ReviewRecencyHeatmap refreshKey={refreshKey} />

        {/* Competitor growth rate — reviews per day */}
        <CompetitorGrowthRate
          data={data.competitorStats}
          loading={loading}
        />
      </div>

      {/* Top reviewers + Review language distribution — side-by-side on lg+ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopReviewers refreshKey={refreshKey} />
        <ReviewLanguageDistribution refreshKey={refreshKey} />
      </div>
    </motion.div>
  );
}
