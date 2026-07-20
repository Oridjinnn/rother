import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";

import { GBP_RUN_LOG_PATH } from "@/lib/gbp/paths";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/health-trend
 *
 * Returns a health trend for the footer sparkline by parsing past run
 * summary lines from data/run.log. Each run writes a line like:
 *   "2026-07-20 08:35:48,686 INFO gbp-monitor.run_all Run summary: {...}"
 *
 * We extract the JSON objects from those lines and build a chronological
 * array of health points (newest last). Capped at the most recent 20 runs.
 *
 * Response shape:
 *   {
 *     points: [{ success, failed, skipped, timestamp, level }],
 *     latest: { success, failed, skipped, level, timestamp } | null,
 *     isMultiPoint: boolean
 *   }
 *
 * `level` is "healthy" | "warning" | "critical" | "unknown".
 */
function computeLevel(success: number, failed: number): string {
  if (failed === 0) return "healthy";
  if (failed >= success && success >= 0) return "critical";
  return "warning";
}

interface HealthPoint {
  success: number;
  failed: number;
  skipped: number;
  timestamp: string;
  level: string;
}

export async function GET() {
  try {
    let logContent = "";
    try {
      logContent = await fs.readFile(GBP_RUN_LOG_PATH, "utf-8");
    } catch {
      logContent = "";
    }

    const points: HealthPoint[] = [];
    const lines = logContent.split("\n");

    // Regex to match run summary log lines and extract the JSON.
    // Line format: "YYYY-MM-DD HH:MM:SS,mmm INFO gbp-monitor.run_all Run summary: {...}"
    const summaryLineRegex =
      /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),\d+\s+INFO\s+gbp-monitor\.run_all\s+Run summary:\s*(\{.+\})\s*$/;

    for (const line of lines) {
      const match = line.match(summaryLineRegex);
      if (!match) continue;
      const timestamp = match[1].replace(" ", "T") + "Z";
      try {
        const summary = JSON.parse(match[2]);
        const success = Number(summary.success) || 0;
        const failed = Number(summary.failed) || 0;
        const skipped = Number(summary.skipped) || 0;
        points.push({
          success,
          failed,
          skipped,
          timestamp,
          level: computeLevel(success, failed),
        });
      } catch {
        // Skip malformed JSON
        continue;
      }
    }

    // Keep only the last 20 runs (most recent)
    const recent = points.slice(-20);

    if (recent.length === 0) {
      return NextResponse.json(
        {
          points: [],
          latest: null,
          isMultiPoint: false,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const latest = recent[recent.length - 1];

    return NextResponse.json(
      {
        points: recent,
        latest: {
          success: latest.success,
          failed: latest.failed,
          skipped: latest.skipped,
          level: latest.level,
          timestamp: latest.timestamp,
        },
        isMultiPoint: recent.length > 1,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: "health-trend query failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
