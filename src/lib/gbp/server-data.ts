/**
 * Server-side helpers for reading the GBP Monitor's JSON files.
 *
 * All functions are defensive: a missing or corrupt file returns a safe
 * empty value rather than throwing, so the dashboard always renders.
 */

import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  ListingsConfig,
  Review,
  RunSummary,
  SelectorsConfig,
} from "./types";
import {
  GBP_LISTINGS_PATH,
  GBP_REVIEWS_NEW_DIR,
  GBP_RUN_LOG_PATH,
  GBP_RUN_SUMMARY_PATH,
  GBP_SELECTORS_PATH,
  GBP_SNAPSHOTS_DIR,
} from "./paths";

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

/** Read + JSON-parse a file. Returns `fallback` on missing/corrupt file. */
export async function readJsonFile<T>(
  filePath: string,
  fallback: T,
): Promise<T> {
  try {
    const buf = await fs.readFile(filePath, "utf-8");
    return JSON.parse(buf) as T;
  } catch {
    return fallback;
  }
}

export async function readListings(): Promise<ListingsConfig> {
  return readJsonFile<ListingsConfig>(GBP_LISTINGS_PATH, { branches: [] });
}

export async function readSelectors(): Promise<SelectorsConfig | null> {
  try {
    const buf = await fs.readFile(GBP_SELECTORS_PATH, "utf-8");
    return JSON.parse(buf) as SelectorsConfig;
  } catch {
    return null;
  }
}

export async function readRunSummary(): Promise<RunSummary | null> {
  return readJsonFile<RunSummary | null>(GBP_RUN_SUMMARY_PATH, null);
}

/** Read the latest snapshot for a single competitor from the versioned layout. */
async function readLatestSnapshot(
  competitorId: string,
): Promise<Review[]> {
  const compDir = path.join(GBP_SNAPSHOTS_DIR, competitorId);
  // Try versioned layout first
  const latestPtr = path.join(compDir, "latest.json");
  const latestFilename = await readJsonFile<string | null>(latestPtr, null);
  if (latestFilename) {
    const snapshotPath = path.join(compDir, latestFilename);
    return cleanReviewNames(await readJsonFile<Review[]>(snapshotPath, []));
  }
  // Fallback: legacy flat file (pre-migration)
  const legacy = path.join(GBP_SNAPSHOTS_DIR, `${competitorId}.json`);
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

/** Read all snapshots from disk (latest version per competitor). */
export async function readAllSnapshots(): Promise<Map<string, Review[]>> {
  const out = new Map<string, Review[]>();
  let entries: string[] = [];
  try {
    entries = await fs.readdir(GBP_SNAPSHOTS_DIR, { withFileTypes: true }).then(
      (dirents) => dirents.filter((d) => d.isDirectory()).map((d) => d.name),
    );
  } catch {
    // GBP_SNAPSHOTS_DIR might not exist yet
  }
  for (const competitorId of entries) {
    const reviews = await readLatestSnapshot(competitorId);
    out.set(competitorId, reviews);
  }
  // Also scan for legacy flat files
  try {
    const all = await fs.readdir(GBP_SNAPSHOTS_DIR);
    for (const entry of all) {
      if (!entry.endsWith(".json") || entry === "latest.json") continue;
      const competitorId = entry.replace(/\.json$/, "");
      if (out.has(competitorId)) continue;
      const full = path.join(GBP_SNAPSHOTS_DIR, entry);
      const reviews = await readJsonFile<Review[]>(full, []);
      out.set(competitorId, reviews);
    }
  } catch {
    // ignore
  }
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
 * Read the most-recent delta file for a competitor (sorted by filename —
 * the orchestrator writes `{competitor_id}_{YYYYMMDDTHHMMSSZ}.json` so the
 * lexical sort gives us the newest first).
 *
 * Returns [] if no delta file exists yet.
 */
export async function readLatestDelta(
  competitorId: string,
): Promise<Review[]> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(GBP_REVIEWS_NEW_DIR);
  } catch {
    return [];
  }
  const matching = entries
    .filter((f) => f.startsWith(`${competitorId}_`) && f.endsWith(".json"))
    .sort()
    .reverse();
  if (matching.length === 0) return [];
  const full = path.join(GBP_REVIEWS_NEW_DIR, matching[0]);
  return cleanReviewNames(await readJsonFile<Review[]>(full, []));
}

/** Tail the last N lines of run.log. */
export async function tailLog(lines = 200): Promise<{
  lines: string[];
  totalLines: number;
}> {
  try {
    const buf = await fs.readFile(GBP_RUN_LOG_PATH, "utf-8");
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

export async function readAllDeltas(): Promise<DeltaFileEntry[]> {
  const out: DeltaFileEntry[] = [];
  let entries: string[] = [];
  try {
    entries = await fs.readdir(GBP_REVIEWS_NEW_DIR);
  } catch {
    return out;
  }
  for (const filename of entries) {
    if (!filename.endsWith(".json")) continue;
    // filename pattern: {competitor_id}_{YYYYMMDDTHHMMSSZ}.json
    const base = filename.replace(/\.json$/, "");
    const underscoreIdx = base.lastIndexOf("_");
    if (underscoreIdx < 0) continue;
    const competitorId = base.slice(0, underscoreIdx);
    const tsRaw = base.slice(underscoreIdx + 1);
    // Convert YYYYMMDDTHHMMSSZ → ISO-ish for display
    const m = tsRaw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
    const run_timestamp = m
      ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`
      : tsRaw;
    const full = path.join(GBP_REVIEWS_NEW_DIR, filename);
    const reviews = cleanReviewNames(await readJsonFile<Review[]>(full, []));
    out.push({ competitor_id: competitorId, run_timestamp, filename, reviews });
  }
  // Sort newest first
  out.sort((a, b) => b.run_timestamp.localeCompare(a.run_timestamp));
  return out;
}
