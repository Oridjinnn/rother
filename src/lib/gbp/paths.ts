/**
 * Absolute filesystem paths to the Rother Python project's data + config.
 *
 * The Python scraper writes to these locations. The dashboard reads from them.
 * All API routes use these constants — never relative paths or hard-coded
 * strings scattered through route handlers.
 *
 * GBP_ROOT resolution (in priority order):
 *   1. GBP_ROOT environment variable (production override)
 *   2. process.cwd() + "gbp-monitor" (development — cwd is project root)
 */

import path from "node:path";

export const GBP_ROOT = (() => {
  if (process.env.GBP_ROOT) {
    return path.resolve(process.env.GBP_ROOT);
  }
  return path.resolve(process.cwd(), "gbp-monitor");
})();
export const GBP_DATA_DIR = path.join(GBP_ROOT, "data");
export const GBP_CONFIG_DIR = path.join(GBP_ROOT, "config");

export const GBP_SNAPSHOTS_DIR = path.join(GBP_DATA_DIR, "snapshots");
export const GBP_REVIEWS_NEW_DIR = path.join(GBP_DATA_DIR, "reviews_new");
export const GBP_RAW_HTML_DIR = path.join(GBP_DATA_DIR, "raw_html");
export const GBP_RUN_LOG_PATH = path.join(GBP_DATA_DIR, "run.log");
export const GBP_RUN_SUMMARY_PATH = path.join(GBP_DATA_DIR, "run_summary.json");

export const GBP_LISTINGS_PATH = path.join(GBP_CONFIG_DIR, "listings.json");
export const GBP_SELECTORS_PATH = path.join(GBP_CONFIG_DIR, "selectors.json");
/**
 * The single, non-seeded business the current user selected during onboarding.
 * Written by POST /api/scrape/trigger. This is the ONLY business the dashboard
 * UI is allowed to read. The seeded Copenhagen Bali entry in listings.json is
 * for legacy/old callers only and must never surface in the UI.
 */
export const GBP_USER_BUSINESS_PATH = path.join(GBP_CONFIG_DIR, "user-business.json");

/**
 * P2 / RISK-024 — tenant scoping. When a real (non-seed) business is active,
 * all of its runtime data lives under `data/users/{businessId}/` so two
 * businesses never share snapshots, deltas, or run summaries. The seed/demo
 * path keeps using `GBP_DATA_DIR` directly (no business id).
 */
export function businessDataDir(businessId?: string | null): string {
  if (businessId) return path.join(GBP_DATA_DIR, "users", businessId);
  return GBP_DATA_DIR;
}
