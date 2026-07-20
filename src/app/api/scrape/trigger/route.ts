import { NextResponse } from "next/server";
import { spawnSync } from "node:child_process";

import type {
  RunSummary,
  ScrapeTriggerErrorResponse,
  ScrapeTriggerResponse,
} from "@/lib/gbp/types";
import { GBP_ROOT, GBP_RUN_SUMMARY_PATH } from "@/lib/gbp/paths";
import { promises as fs } from "node:fs";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

/**
 * POST /api/scrape/trigger
 *
 * Spawns `python3 -m orchestration.run_all --fixtures` in the GBP Monitor
 * project directory and returns the freshly-written run_summary.json.
 *
 * This is the only endpoint that writes (indirectly, via the Python
 * subprocess) to the gbp-monitor/ directory — everything else is read-only.
 *
 * On non-zero exit code OR a missing run_summary.json after the run, returns
 * a 500 with `{ ok: false, error, stderr }` so the dashboard can toast it.
 *
 * Timeout: 60s. In fixtures mode the scraper typically finishes in <1s.
 */
export async function POST() {
  // `--fixtures` is non-negotiable here: the dashboard must never trigger a
  // live Playwright scrape from a browser click (that's what the GitHub
  // Actions cron is for). Live mode requires Playwright binaries installed
  // on the runner and runs against the real Google Maps DOM, where the
  // UNPROVEN seeded selectors will almost certainly fail (per Rule 3).
  const args = ["-m", "orchestration.run_all", "--fixtures"];

  const result = spawnSync("python3", args, {
    cwd: GBP_ROOT,
    encoding: "utf-8",
    timeout: 60_000,
    // Detach stdio so we can capture both streams without deadlocking.
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";

  // The Python orchestrator always exits 0 (per Rule 7 + the run_all.py
  // docstring) so a non-zero exit here means something else went wrong
  // (e.g. Python not installed, module not importable, signal kill).
  if (result.error || result.status !== 0) {
    const errorMessage = result.error
      ? result.error.message
      : `python3 exited with status ${result.status}`;
    const body: ScrapeTriggerErrorResponse = {
      ok: false,
      error: errorMessage,
      stderr: stderr.slice(-4000),
    };
    return NextResponse.json(body, { status: 500 });
  }

  // Read the freshly-written summary.
  let summaryJson: string;
  try {
    summaryJson = await fs.readFile(GBP_RUN_SUMMARY_PATH, "utf-8");
  } catch (err) {
    const body: ScrapeTriggerErrorResponse = {
      ok: false,
      error: `run_summary.json missing after run: ${
        err instanceof Error ? err.message : String(err)
      }`,
      stderr: stderr.slice(-4000),
    };
    return NextResponse.json(body, { status: 500 });
  }

  let summary: RunSummary;
  try {
    summary = JSON.parse(summaryJson) as RunSummary;
  } catch (err) {
    const body: ScrapeTriggerErrorResponse = {
      ok: false,
      error: `run_summary.json is corrupt: ${
        err instanceof Error ? err.message : String(err)
      }`,
      stderr: stderr.slice(-4000),
    };
    return NextResponse.json(body, { status: 500 });
  }

  const body: ScrapeTriggerResponse = { ok: true, summary };
  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
  });
}
