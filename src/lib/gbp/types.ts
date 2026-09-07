/**
 * Shared TypeScript types for the Rother dashboard.
 *
 * These mirror the actual JSON shapes produced by the Python scraper at
 * `/home/z/my-project/gbp-monitor/data/` (see Task 2-a's worklog entry).
 * They are the single source of truth on the client + API side.
 */

/**
 * Normalized place returned by `GET /api/places`. The `place_id` is the OSM
 * canonical anchor (`${osm_type}/${osm_id}`) used by onboarding to resolve the
 * REAL business instead of fuzzy name+location matching. Manual text fallbacks
 * use `place_id: "manual/<slug>"` with `unverified: true`.
 */
export interface NormalizedPlace {
  place_id: string;
  name: string | null;
  formatted_address: string;
  lat: number;
  lng: number;
  city?: string;
  country?: string;
  postcode?: string;
  /** OSM `osm_key/osm_value` (e.g. "amenity/restaurant"), used to auto-fill category. */
  category?: string;
  provider: string;
  /** True when the anchor is a manual-text fallback rather than a verified provider hit. */
  unverified?: boolean;
}

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
  /** Product-path status (single-path scraper). */
  status?:
    | "OK"
    | "BLOCKED"
    | "INSUFFICIENT"
    | "NEED_SESSION"
    | "INVALID_PLACE_ID"
    | "FAILED";
  businessId?: string;
  businessName?: string;
  placeId?: string;
  scrapedAt?: string;
  /** Number of deduplicated reviews actually collected this run. */
  reviewCount?: number;
  /** Target review count requested for the run. */
  targetCount?: number;
  /** Human-readable reason the run stopped (esp. for non-OK statuses). */
  stoppedReason?: string;
}

export interface CompetitorConfig {
  competitor_id: string;
  name: string;
  gmaps_url: string;
  /** Google Maps place_id for the single-path scraper. */
  place_id?: string | null;
  /** Canonical OSM anchor (`osm_type/osm_id`) for OSM-discovered competitors. */
  osm_place_id?: string | null;
  /** Optional business category — used by the multi-category scan (RISK-024 / P1). */
  category?: string;
  /** P4 / geo-grid: geographic coordinates (decimal degrees). When absent the
   *  dashboard attempts to derive them from `gmaps_url` (`!3d..!4d..`). */
  lat?: number;
  lng?: number;
  /** D2 / RISK-002: whether the place_id has been cross-checked against the
   *  resolved business name. Defaults to false; the dashboard shows an
   *  "unverified" badge for false. Never auto-overwritten on mismatch. */
  verified?: boolean;
}

/**
 * Result of the tiered OSM→Google resolver (Phase 2, F2). Never blocks
 * onboarding: if no Google id is recovered the business is still usable with an
 * `unresolved` status and an honest empty collection state.
 *  - status: `verified` (user pasted a Google id), `resolved` (found via Places
 *    API), `unresolved` (no id could be recovered).
 *  - method: how it was obtained — `paste` | `places_api` | `scrape` | `none`.
 *  - confidence: 0..1 cross-check score between OSM name and resolved name.
 */
export interface GmapsResolution {
  status: "verified" | "resolved" | "unresolved";
  method: "paste" | "places_api" | "scrape" | "none";
  confidence: number;
  resolved_at?: string;
  verified_name?: string;
}

export interface BranchConfig {
  branch_id: string;
  branch_name: string;
  /** P4 / geo-grid: branch coordinates (decimal degrees). */
  lat?: number;
  lng?: number;
  /** Canonical OSM anchor (`osm_type/osm_id`) — reliable branch identity. */
  osm_place_id?: string;
  /** Best-effort Google `ChIJ…` place_id; required by the Google review collector. */
  gmaps_place_id?: string | null;
  /** Phase 2 (F2): tiered OSM→Google resolution result. */
  gmaps_resolution?: GmapsResolution;
  /** GBP Reviews API: human-readable location name once linked. */
  gbp_location_name?: string;
  /** GBP Reviews API: total review count (honest coverage denominator). */
  total_review_count?: number;
  city?: string;
  country?: string;
  postcode?: string;
  /** True when the anchor is a manual-text fallback rather than a verified provider hit. */
  unverified?: boolean;
  /** "business" = named place; "address" = address-only branch entered in onboarding. */
  branch_kind?: "business" | "address";
  competitors: CompetitorConfig[];
}

export interface ListingsConfig {
  _comment?: string;
  branches: BranchConfig[];
}

/**
 * A single monitored business. `isSeeded` marks the legacy Copenhagen Bali demo
 * entry that must NEVER be shown in the UI — it exists only for old callers.
 */
export interface BusinessEntry {
  id: string;
  name: string;
  isSeeded?: boolean;
  category?: string;
  categoryId?: string;
  /** P4 / geo-grid: business HQ coordinates (decimal degrees). */
  lat?: number;
  lng?: number;
  /** Canonical OSM anchor (`osm_type/osm_id`). */
  osm_place_id?: string;
  /** Best-effort Google `ChIJ…` place_id; required by the Google review collector. */
  gmaps_place_id?: string | null;
  city?: string;
  country?: string;
  postcode?: string;
  unverified?: boolean;
  branches: BranchConfig[];
}

/** Wrapped listings.json shape (post ROTHER-AUDIT): one or more businesses. */
export interface BusinessesFile {
  businesses: BusinessEntry[];
}

/**
 * The active user-selected business, persisted by POST /api/scrape/trigger to
 * `user-business.json`. This is what the dashboard UI scopes to exclusively.
 */
export interface ActiveBusiness {
  id: string;
  name: string;
  location: string;
  category?: string;
  categoryId?: string;
  /** Google Maps place_id for the single-path scraper. Required for a live
   *  scrape; without it the Python side refuses with a NEED_SESSION-style
   *  honest error rather than scraping anonymously. Alias of gmaps_place_id. */
  place_id?: string;
  /** Canonical OSM anchor (`osm_type/osm_id`) — the reliable business identity
   *  used for discovery; always available from onboarding. */
  osm_place_id?: string;
  /** Best-effort Google `ChIJ…` place_id; the collector needs this for Google
   *  review content. Null/undefined when only an OSM anchor was resolved, in
   *  which case Google collection degrades to an empty-state. */
  gmaps_place_id?: string | null;
  /** Phase 2 (F2): tiered OSM→Google resolution result. */
  gmaps_resolution?: GmapsResolution;
  /** GBP Reviews API: human-readable location name once linked. */
  gbp_location_name?: string;
  /** GBP Reviews API: total review count (honest coverage denominator). */
  total_review_count?: number;
  /** P4 / geo-grid: business HQ coordinates (decimal degrees). */
  lat?: number;
  lng?: number;
  city?: string;
  country?: string;
  postcode?: string;
  /** True when the anchor is a manual-text fallback rather than a verified provider hit. */
  unverified?: boolean;
  /** P2 / tenant scoping: the user's own monitored branches + competitors.
   *  When present, the dashboard reads THIS config (scoped to the business)
   *  instead of the seed demo listings. */
  branches?: BranchConfig[];
  scrapedAt: string;
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
  /** D2 / RISK-002: whether the place_id was cross-checked against the
   *  resolved business name. When false the UI shows an "Unverified" badge. */
  verified?: boolean;
}

/** Health of the underlying data layer for the current request (D4 / TD-H06). */
export type DataStatus = "ok" | "missing" | "corrupt";

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
  /** D4 / TD-H06: health of the data layer for this request. */
  dataStatus: DataStatus;
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
    verified?: boolean;
  }[];
}

export interface BranchesResponse {
  branches: BranchWithStats[];
  totalCompetitors: number;
  totalReviews: number;
  /** D4 / TD-H06: health of the data layer for this request. */
  dataStatus: DataStatus;
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

/** P1 / RISK-024 — a single discovered competitor candidate from a category scan. */
export interface CandidateCompetitor {
  name: string | null;
  gmaps_url: string;
  place_id: string | null;
  rating: number | null;
  reviews_count: number | null;
}

/** P1 / RISK-024 — the full result of a category discovery scan. */
export interface CategoryScanResponse {
  category: string;
  location: string;
  query_url: string;
  mode: "fixtures" | "live";
  timestamp: string;
  candidates: CandidateCompetitor[];
}

/** P4 / geo-grid — a single mapped point. */
export interface GeoPoint {
  id: string;
  label: string;
  kind: "business" | "branch" | "competitor";
  lat: number;
  lng: number;
  rating?: number | null;
  /** How the coordinates were obtained, for honest provenance in the UI. */
  source: "config" | "url_geocode" | "unknown";
}

/** P4 / geo-grid — a uniform grid cell used to overlay a competitive "grid". */
export interface GeoGridCell {
  row: number;
  col: number;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  pointCount: number;
}

export interface GeoBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface GeoGridResponse {
  points: GeoPoint[];
  bounds: GeoBounds | null;
  grid: {
    rows: number;
    cols: number;
    cells: GeoGridCell[];
  };
}
