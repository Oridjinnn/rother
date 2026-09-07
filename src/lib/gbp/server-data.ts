/**
 * Server-side helpers for reading Rother's JSON files.
 *
 * All functions are defensive: a missing or corrupt file returns a safe
 * empty value rather than throwing, so the dashboard always renders.
 */

import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  ActiveBusiness,
  BranchConfig,
  BusinessEntry,
  BusinessesFile,
  CategoryScanResponse,
  DataStatus,
  ListingsConfig,
  Review,
  RunSummary,
  SelectorsConfig,
} from "./types";
import {
  GBP_DATA_DIR,
  GBP_LISTINGS_PATH,
  GBP_REVIEWS_NEW_DIR,
  GBP_RUN_LOG_PATH,
  GBP_RUN_SUMMARY_PATH,
  GBP_SELECTORS_PATH,
  GBP_SNAPSHOTS_DIR,
  GBP_USER_BUSINESS_PATH,
} from "./paths";
import { validateCompetitorId } from "./validate";
import { businessDataDir } from "./paths";

/** Strip `, original` suffix from a reviewer name if present. */
function cleanReviewerName(name: string | null): string | null {
  if (!name) return name;
  return name.replace(/,\s*original$/i, "").trim() || name;
}

/** Clean all reviewer names in a review array at the API layer. */
function cleanReviewNames(reviews: Review[]): Review[] {
  return reviews.map((r) => ({
    ...r,
    reviewer_name: cleanReviewerName(r.reviewer_name),
  }));
}

/**
 * Read + JSON-parse a file. Returns `fallback` on missing/corrupt file.
 *
 * D4 / TD-H06: previously the catch was fully silent, so a corrupt or missing
 * snapshot rendered as an empty dashboard with no signal. We now log the
 * failure (server-side) so an operator can tell "no data" apart from
 * "scraper failed / file corrupt". Pointer files that are legitimately absent
 * (e.g. a competitor with no snapshot yet) still log at debug level to avoid
 * false alarms — see the guard below.
 */
export async function readJsonFile<T>(
  filePath: string,
  fallback: T,
): Promise<T> {
  try {
    const buf = await fs.readFile(filePath, "utf-8");
    return JSON.parse(buf) as T;
  } catch (err) {
    const isPointer = filePath.endsWith("latest.json") || filePath.endsWith(".json");
    if (isPointer && (err as NodeJS.ErrnoException)?.code === "ENOENT") {
      // Expected-absent pointer/seed file — no data yet, not a failure.
      console.debug(`[server-data] no file (using fallback): ${filePath}`);
    } else {
      console.error(`[server-data] read failed: ${filePath}`, err);
    }
    return fallback;
  }
}

/**
 * Read the active user-selected business from `user-business.json`.
 * Returns `null` when the user has not yet run a scrape (no business selected).
 * This is the ONLY business the UI is permitted to read.
 */
export async function readActiveBusiness(): Promise<ActiveBusiness | null> {
  return readJsonFile<ActiveBusiness | null>(GBP_USER_BUSINESS_PATH, null);
}

/**
 * True once the user has selected + run their own business. While false, the
 * seed/demo data is still served to legacy (non-UI) callers; once true, the UI
 * readers below return empty so the seeded Copenhagen Bali demo can NEVER
 * appear in the dashboard.
 */
async function hasActiveUserBusiness(): Promise<boolean> {
  return (await readActiveBusiness()) !== null;
}

/**
 * Read the LEGACY seed listings (Copenhagen Bali demo). Kept for old callers
 * only — the UI must never consume this. Handles both the pre-audit flat
 * `{ branches: [] }` shape and the post-audit `{ businesses: [] }` shape.
 */
export async function readSeedListings(): Promise<ListingsConfig> {
  const raw = await readJsonFile<BusinessesFile | ListingsConfig>(
    GBP_LISTINGS_PATH,
    { branches: [] },
  );
  if ("businesses" in raw && Array.isArray(raw.businesses)) {
    const seeded =
      raw.businesses.find((b: BusinessEntry) => b.isSeeded) ?? raw.businesses[0];
    return { branches: seeded?.branches ?? [] };
  }
  return { branches: (raw as ListingsConfig).branches ?? [] };
}

/**
 * UI-facing listings reader. Returns the seed demo ONLY when no user business
 * is active (i.e. nothing is rendered). Once the user has run their own
 * business, it returns empty so the demo can never leak into the UI.
 */
// P5 / B12: a short-TTL in-memory cache avoids re-reading + re-parsing the
// listings file on every request. Active-user mode returns an immediate empty
// object and is not cached (the demo path is static between scrapes).
const LISTINGS_CACHE_TTL_MS = 10_000;
let _listingsCache: { value: ListingsConfig; ts: number } | null = null;

export async function readListings(): Promise<ListingsConfig> {
  if (await hasActiveUserBusiness()) return { branches: [] };
  const now = Date.now();
  if (_listingsCache && now - _listingsCache.ts < LISTINGS_CACHE_TTL_MS) {
    return _listingsCache.value;
  }
  const value = await readSeedListings();
  _listingsCache = { value, ts: now };
  return value;
}

export async function readSelectors(): Promise<SelectorsConfig | null> {
  try {
    const buf = await fs.readFile(GBP_SELECTORS_PATH, "utf-8");
    return JSON.parse(buf) as SelectorsConfig;
  } catch {
    return null;
  }
}

export async function readRunSummary(
  businessId?: string,
): Promise<RunSummary | null> {
  const active = await readActiveBusiness();
  const id = businessId ?? active?.id;
  const summaryPath = id
    ? path.join(businessDataDir(id), "run_summary.json")
    : GBP_RUN_SUMMARY_PATH;
  return readJsonFile<RunSummary | null>(summaryPath, null);
}

/** Read the latest snapshot for a single competitor from the versioned layout.
 *  When `businessId` is supplied, reads from that business's scoped data dir. */
async function readLatestSnapshot(
  competitorId: string,
  businessId?: string,
): Promise<Review[]> {
  validateCompetitorId(competitorId);
  const root = businessId
    ? path.join(businessDataDir(businessId), "snapshots")
    : GBP_SNAPSHOTS_DIR;
  const compDir = path.join(root, competitorId);
  // Try versioned layout first
  const latestPtr = path.join(compDir, "latest.json");
  const latestFilename = await readJsonFile<string | null>(latestPtr, null);
  if (latestFilename) {
    const snapshotPath = path.join(compDir, latestFilename);
    return cleanReviewNames(await readJsonFile<Review[]>(snapshotPath, []));
  }
  // Fallback: legacy flat file (pre-migration)
  const legacy = path.join(root, `${competitorId}.json`);
  if (await fileExists(legacy)) {
    return cleanReviewNames(await readJsonFile<Review[]>(legacy, []));
  }
  return [];
}

/** Check if a file exists without throwing. */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// P5 / B12: the snapshot + delta directories are static between scrapes, so a
// short-TTL in-memory cache avoids re-reading + re-parsing every snapshot /
// delta file on every request. Active-user mode returns an immediate empty map
// and is not cached.
const SNAPSHOTS_CACHE_TTL_MS = 10_000;
const DELTAS_CACHE_TTL_MS = 10_000;
let _snapshotsCache: { value: Map<string, Review[]>; ts: number } | null = null;
let _deltasCache: { value: DeltaFileEntry[]; ts: number } | null = null;

/** Read all snapshots from disk (latest version per competitor).
 *  P2 / tenant scoping: when a business is active (or `businessId` is passed)
 *  reads from that business's scoped data dir instead of the seed demo. */
export async function readAllSnapshots(
  businessId?: string,
): Promise<Map<string, Review[]>> {
  const active = await readActiveBusiness();
  const id = businessId ?? active?.id;
  // An active business with no resolvable id has no data yet.
  if (active && !id) return new Map<string, Review[]>();

  const root = id
    ? path.join(businessDataDir(id), "snapshots")
    : GBP_SNAPSHOTS_DIR;

  const now = Date.now();
  if (!id && _snapshotsCache && now - _snapshotsCache.ts < SNAPSHOTS_CACHE_TTL_MS) {
    return _snapshotsCache.value;
  }

  const out = new Map<string, Review[]>();
  try {
    const entries = await fs.readdir(root, { withFileTypes: true }).then(
      (dirents) => dirents.filter((d) => d.isDirectory()).map((d) => d.name),
    );
    for (const competitorId of entries) {
      const reviews = await readLatestSnapshot(competitorId, id);
      out.set(competitorId, reviews);
    }
  } catch {
    // data dir might not exist yet
  }
  try {
    const all = await fs.readdir(root);
    for (const entry of all) {
      if (!entry.endsWith(".json") || entry === "latest.json") continue;
      const competitorId = entry.replace(/\.json$/, "");
      if (out.has(competitorId)) continue;
      const full = path.join(root, entry);
      const reviews = await readJsonFile<Review[]>(full, []);
      out.set(competitorId, reviews);
    }
  } catch {
    // ignore
  }
  if (!id) _snapshotsCache = { value: out, ts: now };
  return out;
}

/** Metadata for a versioned snapshot entry. */
export interface SnapshotEntry {
  timestamp: string;
  filename: string;
  review_count: number;
}

/** List all available snapshot timestamps for a competitor. */
export async function listSnapshots(
  competitorId: string,
): Promise<SnapshotEntry[]> {
  validateCompetitorId(competitorId);
  const compDir = path.join(GBP_SNAPSHOTS_DIR, competitorId);
  try {
    const files = await fs.readdir(compDir);
    const snapshots: SnapshotEntry[] = [];
    for (const f of files) {
      if (!f.endsWith(".json") || f === "latest.json") continue;
      const tsRaw = f.replace(/\.json$/, "");
      // Convert filename-safe format back to ISO for display
      const ts = tsRaw
        .replace(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})Z$/, "$1-$2-$3T$4:$5:$6Z");
      const full = path.join(compDir, f);
      const reviews = await readJsonFile<Review[]>(full, []);
      snapshots.push({
        timestamp: ts,
        filename: f,
        review_count: reviews.length,
      });
    }
    snapshots.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return snapshots;
  } catch {
    return [];
  }
}

/** Load a specific historical snapshot. timestamp can be "latest" or ISO string. */
export async function readSnapshotAt(
  competitorId: string,
  timestamp: string,
): Promise<Review[]> {
  validateCompetitorId(competitorId);
  if (timestamp === "latest") {
    return readLatestSnapshot(competitorId);
  }
  // Normalize colons to hyphens for filename matching
  const safe = timestamp.replace(/:/g, "-");
  const compDir = path.join(GBP_SNAPSHOTS_DIR, competitorId);
  const snapshotPath = path.join(compDir, `${safe}.json`);
  return cleanReviewNames(await readJsonFile<Review[]>(snapshotPath, []));
}

/**
 * Read the most-recent delta file for a competitor. When `businessId` is
 * supplied, reads from that business's scoped data dir (P2 / tenant scoping).
 * Returns [] if no delta file exists yet.
 */
export async function readLatestDelta(
  competitorId: string,
  businessId?: string,
): Promise<Review[]> {
  const active = await readActiveBusiness();
  const id = businessId ?? active?.id;
  if (active && !id) return [];
  const root = id
    ? path.join(businessDataDir(id), "reviews_new")
    : GBP_REVIEWS_NEW_DIR;
  let entries: string[] = [];
  try {
    entries = await fs.readdir(root);
  } catch {
    return [];
  }
  const matching = entries
    .filter((f) => f.startsWith(`${competitorId}_`) && f.endsWith(".json"))
    .sort()
    .reverse();
  if (matching.length === 0) return [];
  const full = path.join(root, matching[0]);
  return cleanReviewNames(await readJsonFile<Review[]>(full, []));
}

/** Tail the last N lines of run.log. Scoped to the business's data dir (P2). */
export async function tailLog(
  lines = 200,
  businessId?: string,
): Promise<{
  lines: string[];
  totalLines: number;
}> {
  const active = await readActiveBusiness();
  const id = businessId ?? active?.id;
  const logPath = id
    ? path.join(businessDataDir(id), "run.log")
    : GBP_RUN_LOG_PATH;
  try {
    const buf = await fs.readFile(logPath, "utf-8");
    const all = buf.split("\n").filter((l) => l.length > 0);
    return {
      lines: all.slice(-lines),
      totalLines: all.length,
    };
  } catch {
    return { lines: [], totalLines: 0 };
  }
}

/**
 * Read ALL delta files across all competitors, sorted newest-first by
 * filename (the orchestrator writes `{competitor_id}_{YYYYMMDDTHHMMSSZ}.json`
 * so lexical sort = chronological sort).
 *
 * Each entry has the competitor_id, the run timestamp (parsed from filename),
 * and the review delta. Used by the Run History timeline panel.
 */
export interface DeltaFileEntry {
  competitor_id: string;
  run_timestamp: string; // ISO-ish, parsed from filename
  filename: string;
  reviews: Review[];
}

export async function readAllDeltas(
  businessId?: string,
): Promise<DeltaFileEntry[]> {
  const active = await readActiveBusiness();
  const id = businessId ?? active?.id;
  if (active && !id) return [];
  const root = id
    ? path.join(businessDataDir(id), "reviews_new")
    : GBP_REVIEWS_NEW_DIR;

  const now = Date.now();
  if (!id && _deltasCache && now - _deltasCache.ts < DELTAS_CACHE_TTL_MS) {
    return _deltasCache.value;
  }

  const out: DeltaFileEntry[] = [];
  let entries: string[] = [];
  try {
    entries = await fs.readdir(root);
  } catch {
    return out;
  }
  for (const filename of entries) {
    if (!filename.endsWith(".json")) continue;
    const base = filename.replace(/\.json$/, "");
    const m = base.match(/^(.*)_(\d{8}T\d{6}Z)$/);
    if (!m) continue;
    const competitorId = m[1];
    const tsRaw = m[2];
    const ts = tsRaw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
    const run_timestamp = ts
      ? `${ts[1]}-${ts[2]}-${ts[3]}T${ts[4]}:${ts[5]}:${ts[6]}Z`
      : tsRaw;
    const full = path.join(root, filename);
    const reviews = cleanReviewNames(await readJsonFile<Review[]>(full, []));
    out.push({ competitor_id: competitorId, run_timestamp, filename, reviews });
  }
  out.sort((a, b) => b.run_timestamp.localeCompare(a.run_timestamp));
  if (!id) _deltasCache = { value: out, ts: now };
  return out;
}

/**
 * D4 / TD-H06 — assess the health of the data layer for the current request
 * and return a machine-readable status so the dashboard can surface a
 * "missing baseline" / "corrupt data" state instead of a silently empty UI.
 *
 *  - "missing": no seed listings file AND no active user business (greenfield —
 *    the user has not run a scrape and no demo baseline is present).
 *  - "corrupt": a required file exists but fails JSON parse.
 *  - "ok": otherwise (seed present, or an active user business is selected).
 */
export async function assessDataStatus(
  businessId?: string,
): Promise<DataStatus> {
  const active = await readActiveBusiness();
  const id = businessId ?? active?.id;

  // P2 / tenant scoping: assess the business's OWN data dir.
  if (active && id) {
    const dir = businessDataDir(id);
    try {
      const entries = await fs.readdir(path.join(dir, "snapshots"));
      if (entries.length > 0) return "ok";
      return "missing";
    } catch {
      return "missing";
    }
  }

  let listingsPresent = false;
  try {
    await fs.access(GBP_LISTINGS_PATH);
    listingsPresent = true;
    JSON.parse(await fs.readFile(GBP_LISTINGS_PATH, "utf-8"));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      listingsPresent = false;
    } else if (listingsPresent) {
      // File exists but is unparseable -> corrupt baseline.
      return "corrupt";
    }
  }
  if (!active && !listingsPresent) return "missing";
  return "ok";
}

/**
 * P2 / tenant scoping — return the active business's OWN monitored branches
 * (persisted on `user-business.json`). Falls back to the seed demo listings
 * when no active business is selected (legacy/non-UI callers).
 */
export async function readActiveBusinessBranches(): Promise<BranchConfig[]> {
  const active = await readActiveBusiness();
  if (Array.isArray(active?.branches) && active.branches.length > 0) {
    return active.branches;
  }
  if (active) {
    // Active business exists but has no branches configured yet → explicit empty.
    return [];
  }
  // No active business → legacy seed demo branches (UI never renders these).
  return (await readSeedListings()).branches;
}

/**
 * P2 / tenant scoping — persist the active business's monitored branches.
 * Merges into the existing `user-business.json` without disturbing the other
 * fields (name, location, category, lat/lng, scrapedAt).
 */
export async function writeActiveBusinessBranches(
  branches: BranchConfig[],
): Promise<ActiveBusiness> {
  const existing = await readActiveBusiness();
  if (!existing) {
    throw new Error("No active business selected — cannot persist branches.");
  }
  const updated: ActiveBusiness = { ...existing, branches };
  await fs.writeFile(
    GBP_USER_BUSINESS_PATH,
    JSON.stringify(updated, null, 2),
    "utf-8",
  );
  return updated;
}

/**
 * P1 / RISK-024 — read the most recent category-scan result for a business.
 * Scoped to the business's data dir; returns `null` when no scan has run.
 */
export async function readCategoryScan(
  businessId?: string,
): Promise<CategoryScanResponse | null> {
  const active = await readActiveBusiness();
  const id = businessId ?? active?.id;
  const dir = id ? businessDataDir(id) : GBP_DATA_DIR;
  const scanDir = path.join(dir, "category_scan");
  const latest = await readJsonFile<string | null>(
    path.join(scanDir, "latest.json"),
    null,
  );
  if (!latest) return null;
  return readJsonFile<CategoryScanResponse | null>(
    path.join(scanDir, latest),
    null,
  );
}
