/**
 * Shared TypeScript types for the Rother dashboard.
 *
 * These mirror the actual JSON shapes produced by the Python scraper at
 * `/home/z/my-project/gbp-monitor/data/` (see Task 2-a's worklog entry).
 * They are the single source of truth on the client + API side.
 */

export interface Review {
  review_id: string;
  competitor_id: string;
  branch_id: string;
  /** May contain the suffix `, original` from the Google Maps aria-label —
   *  strip it client-side before display. */
  reviewer_name: string | null;
  /** 1.0–5.0, or null if the parser couldn't extract it. */
  rating: number | null;
  text: string | null;
  relative_date: string | null;
  /** ISO 8601 string. */
  scraped_at: string;
}

export interface RunSummaryError {
  competitor_id: string;
  error: string;
}

export interface RunSummary {
  started_at: string;
  finished_at: string | null;
  mode: "fixtures" | "live";
  success: number;
  failed: number;
  skipped: number;
  new_reviews: number;
  total_reviews: number;
  errors: RunSummaryError[];
}

export interface CompetitorConfig {
  competitor_id: string;
  name: string;
  gmaps_url: string;
}

export interface BranchConfig {
  branch_id: string;
  branch_name: string;
  competitors: CompetitorConfig[];
}

export interface ListingsConfig {
  _comment?: string;
  branches: BranchConfig[];
}

export type VerifiedBy = "seed" | "browser_agent" | "manual_human";

export interface SelectorsMeta {
  last_verified: string | null;
  verified_by: VerifiedBy | null;
  schema_version: number;
  descriptions: Record<string, string>;
  selector_types: Record<string, string>;
  fallback_notes?: Record<string, string>;
}

export interface SelectorsConfig {
  _meta?: SelectorsMeta;
  last_verified?: string;
  verified_by?: VerifiedBy;
  _verification_note?: string;
  [key: string]: unknown;
}

/** Per-competitor aggregated stats, computed by the API layer. */
export interface CompetitorStats {
  competitor_id: string;
  name: string;
  branch_id: string;
  branch_name: string;
  gmaps_url: string;
  total_reviews: number;
  average_rating: number | null;
  last_scraped_at: string | null;
  new_reviews_count: number;
  latest_review: { text: string | null; relative_date: string | null; rating: number | null } | null;
  average_review_length: number | null;
  trend_indicator: "up" | "down" | "stable" | null;
}

/** Branch tree enriched with per-competitor stats. */
export interface BranchWithStats {
  branch_id: string;
  branch_name: string;
  competitors: CompetitorStats[];
  total_reviews: number;
  new_reviews_count: number;
  review_velocity: number | null;
  last_scrape: string | null;
}

export interface RatingDistribution {
  rating: number;
  count: number;
}

export interface OverviewResponse {
  runSummary: RunSummary | null;
  selectorVerification: {
    verified_by: VerifiedBy;
    last_verified: string;
    isUnproven: boolean;
    note?: string;
  };
  totalBranches: number;
  totalCompetitors: number;
  totalReviews: number;
  newReviewsLastRun: number;
  ratingDistribution: RatingDistribution[];
  errors: RunSummaryError[];
  isAlert: boolean;
  /** Branch ID → new review count (most recent delta). */
  newReviewsPerBranch: { branch_id: string; branch_name: string; count: number }[];
  /** Per-competitor review counts — for the "Reviews per Competitor" chart. */
  competitorStats: {
    competitor_id: string;
    name: string;
    branch_name: string;
    total_reviews: number;
    average_rating: number | null;
    new_reviews_count: number;
    last_scraped_at: string | null;
  }[];
}

export interface BranchesResponse {
  branches: BranchWithStats[];
  totalCompetitors: number;
  totalReviews: number;
}

export interface ReviewsQuery {
  branch_id?: string;
  competitor_id?: string;
  rating?: string; // comma-separated ratings, e.g. "1,3,5"
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface ReviewsResponse {
  data: Review[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LogsResponse {
  lines: string[];
  totalLines: number;
  requestedLines: number;
}

export interface ScrapeTriggerAsyncResponse {
  ok: true;
  runId: string;
}

export interface ScrapeTriggerResponse {
  ok: true;
  summary: RunSummary;
}

export interface ScrapeTriggerErrorResponse {
  ok: false;
  error: string;
  stderr: string;
  stage: string;
  probable_cause: string;
  suggested_fix: string;
}

/** One run's worth of new-review deltas, grouped by competitor.
 *  Returned by GET /api/history. */
export interface HistoryRunBreakdownItem {
  competitor_id: string;
  competitor_name: string;
  branch_id: string;
  branch_name: string;
  count: number;
}

export interface HistoryRun {
  run_timestamp: string; // ISO 8601
  total_new_reviews: number;
  competitors_with_new: number;
  branches_affected: string[];
  breakdown: HistoryRunBreakdownItem[];
}

export interface HistoryResponse {
  runs: HistoryRun[];
  totalRuns: number;
}

/** One data point in the "Reviews count over time" time series.
 *  Returned by GET /api/reviews-over-time. */
export interface ReviewsOverTimePoint {
  date: string; // YYYY-MM-DD
  new_reviews: number;
  cumulative: number;
}

export interface ReviewsOverTimeResponse {
  data: ReviewsOverTimePoint[];
  totalPoints: number;
  totalReviews: number;
}

/** One bucket in the review text length distribution.
 *  Returned by GET /api/review-lengths. */
export interface ReviewLengthBucket {
  label: string;
  range: string;
  count: number;
  color: string;
}

export interface ReviewLengthsResponse {
  buckets: ReviewLengthBucket[];
  stats: {
    total: number;
    withText: number;
    average: number;
    median: number;
    min: number;
    max: number;
  };
}

export type AlertType =
  | "new_reviews"
  | "rating_drop"
  | "scrape_failure"
  | "run_failure"
  | "selector_degradation"
  | "large_review_increase";

export type AlertSeverity = "info" | "warning" | "error";

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  detail?: string;
  competitor_id?: string;
  branch_id?: string;
  delta_count?: number;
  source: string;
  timestamp: string;
}

export interface AlertsResponse {
  alerts: Alert[];
  total: number;
}

export interface ConfigUpdateRequest {
  branches?: BranchConfig[];
  [key: string]: unknown;
}

export interface HistoricalComparisonResponse {
  competitor_id: string;
  competitor_name: string;
  branch_name: string;
  older: { review_id: string; rating: number | null; text: string | null; relative_date: string | null; scraped_at: string }[];
  newer: { review_id: string; rating: number | null; text: string | null; relative_date: string | null; scraped_at: string }[];
  older_timestamp: string | null;
  newer_timestamp: string | null;
  older_count: number;
  newer_count: number;
  new_in_newer: string[];
  removed_from_newer: string[];
  rating_changed: { review_id: string; old_rating: number | null; new_rating: number | null }[];
}
