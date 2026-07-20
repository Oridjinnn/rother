import { NextResponse } from "next/server";

import type { LogsResponse } from "@/lib/gbp/types";
import { tailLog } from "@/lib/gbp/server-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/logs?lines=200
 *
 * Tail the last N lines of `data/run.log`. Returns:
 *   { lines: string[], totalLines: number, requestedLines: number }
 *
 * `lines` is capped at 2000 to keep the payload reasonable.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedLines = Math.min(
      2000,
      Math.max(1, parseInt(searchParams.get("lines") || "200", 10) || 200),
    );
    const { lines, totalLines } = await tailLog(requestedLines);

    const body: LogsResponse = { lines, totalLines, requestedLines };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "log tail failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
