import { NextResponse } from "next/server";

import type { ScrapeTriggerAsyncResponse, ScrapeTriggerErrorResponse } from "@/lib/gbp/types";
import { scrapeRunManager } from "@/lib/gbp/scrape-runner";
import { sanitizeError } from "@/lib/gbp/sanitize";

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
      {
        ok: false,
        error: `Invalid mode: ${mode}`,
        stderr: "",
        stage: "validation",
        probable_cause: "Invalid mode parameter",
        suggested_fix: "Use 'fixtures' or 'live'",
      } satisfies ScrapeTriggerErrorResponse,
      { status: 400 },
    );
  }

  let runId: string;
  try {
    runId = await scrapeRunManager.start(mode as "fixtures" | "live");
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: sanitizeError(err),
        stderr: "",
        stage: "spawn_failed",
        probable_cause: "Could not start scraper process.",
        suggested_fix: "Verify Python is installed and accessible from PATH, and GBP_ROOT is configured correctly.",
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
  return NextResponse.json({ ok: true });
}
