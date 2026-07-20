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

/** Read all snapshots from disk. Returns a map of competitor_id → Review[]. */
export async function readAllSnapshots(): Promise<Map<string, Review[]>> {
  const out = new Map<string, Review[]>();
  let entries: string[] = [];
  try {
    entries = await fs.readdir(GBP_SNAPSHOTS_DIR);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const competitorId = entry.replace(/\.json$/, "");
    const full = path.join(GBP_SNAPSHOTS_DIR, entry);
    const reviews = await readJsonFile<Review[]>(full, []);
    out.set(competitorId, reviews);
  }
  return out;
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
  return readJsonFile<Review[]>(full, []);
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
