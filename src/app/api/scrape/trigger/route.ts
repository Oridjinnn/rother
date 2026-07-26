import { NextResponse } from "next/server";

import type { ScrapeTriggerAsyncResponse, ScrapeTriggerErrorResponse } from "@/lib/gbp/types";
import { scrapeRunManager } from "@/lib/gbp/scrape-runner";
import { GBP_ROOT } from "@/lib/gbp/paths";
import { promises as fs } from "node:fs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request?: Request) {
  let mode = "fixtures";
  if (request) {
    const url = new URL(request.url);
    mode = url.searchParams.get("mode") || "fixtures";
  }
  if (mode !== "fixtures" && mode !== "live") {
    return NextResponse.json(
      { ok: false, error: `Invalid mode: ${mode}` } satisfies ScrapeTriggerErrorResponse,
      { status: 400 },
    );
  }

  let rootExists = false;
  try {
    await fs.access(GBP_ROOT);
    rootExists = true;
  } catch {
    rootExists = false;
  }
  if (!rootExists) {
    return NextResponse.json(
      {
        ok: false,
        error: `GBP_ROOT directory does not exist: ${GBP_ROOT}`,
        stderr: "",
        stage: "spawn_failed",
        probable_cause: "GBP_ROOT directory is missing",
        suggested_fix: "Check GBP_ROOT environment variable or ensure gbp-monitor directory exists",
      } satisfies ScrapeTriggerErrorResponse,
      { status: 500 },
    );
  }

  let runId: string;
  try {
    runId = await scrapeRunManager.start(mode as "fixtures" | "live");
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        stderr: "",
        stage: "spawn_failed",
        probable_cause: "Could not spawn Python scraper process",
        suggested_fix: "Verify Python is installed and accessible from PATH",
      } satisfies ScrapeTriggerErrorResponse,
      { status: 500 },
    );
  }

  const body: ScrapeTriggerAsyncResponse = { ok: true, runId };
  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    gbp_root: GBP_ROOT,
    gbp_root_exists: await fs.access(GBP_ROOT).then(() => true).catch(() => false),
    platform: process.platform,
  });
}
