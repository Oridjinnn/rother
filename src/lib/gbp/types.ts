/**
 * Shared TypeScript types for the GBP Monitor dashboard.
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

export interface SelectorsConfig {
  last_verified: string;
  verified_by: VerifiedBy;
  _verification_note?: string;
  [key: string]: string;
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
}

/** Branch tree enriched with per-competitor stats. */
export interface BranchWithStats {
  branch_id: string;
  branch_name: string;
  competitors: CompetitorStats[];
  total_reviews: number;
  new_reviews_count: number;
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

export interface ScrapeTriggerResponse {
  ok: true;
  summary: RunSummary;
}

export interface ScrapeTriggerErrorResponse {
  ok: false;
  error: string;
  stderr: string;
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
