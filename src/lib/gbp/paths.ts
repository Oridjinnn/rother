/**
 * Absolute filesystem paths to the GBP Monitor Python project's data + config.
 *
 * The Python scraper (Task 2-a) writes to these locations. The dashboard
 * reads from them. All API routes use these constants — never relative paths
 * or hard-coded strings scattered through route handlers.
 */

import path from "node:path";

export const GBP_ROOT = path.resolve("/home/z/my-project/gbp-monitor");
export const GBP_DATA_DIR = path.join(GBP_ROOT, "data");
export const GBP_CONFIG_DIR = path.join(GBP_ROOT, "config");

export const GBP_SNAPSHOTS_DIR = path.join(GBP_DATA_DIR, "snapshots");
export const GBP_REVIEWS_NEW_DIR = path.join(GBP_DATA_DIR, "reviews_new");
export const GBP_RAW_HTML_DIR = path.join(GBP_DATA_DIR, "raw_html");
export const GBP_RUN_LOG_PATH = path.join(GBP_DATA_DIR, "run.log");
export const GBP_RUN_SUMMARY_PATH = path.join(GBP_DATA_DIR, "run_summary.json");

export const GBP_LISTINGS_PATH = path.join(GBP_CONFIG_DIR, "listings.json");
export const GBP_SELECTORS_PATH = path.join(GBP_CONFIG_DIR, "selectors.json");
