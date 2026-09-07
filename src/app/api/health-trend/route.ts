import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";

import { sanitizeError } from "@/lib/gbp/sanitize";
import { parseRunSummaryLine, type HealthPoint } from "@/lib/gbp/health-trend";

import { GBP_RUN_LOG_PATH } from "@/lib/gbp/paths";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/health-trend
 *
 * Returns a health trend for the footer sparkline by parsing past run
 * summary lines from data/run.log. The Python orchestrator emits
 * structured JSONLOG lines like:
 *   2026-07-20 08:35:48,686 INFO gbp-monitor.run_all JSONLOG: {"stage":"run_summary","success":3,...}
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

    for (const line of lines) {
      const point = parseRunSummaryLine(line);
      if (point) points.push(point);
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
        detail: sanitizeError(err),
      },
      { status: 500 },
    );
  }
}
