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
 * Cross-platform Python executable discovery.
 *
 * Tries common names in order and returns the first that:
 *   - exists on disk
 *   - runs `--version` successfully
 *   - produces a non-empty version string
 *
 * Order: "python3" (Linux/macOS), "python" (Windows fallback).
 */
function findPython(): { executable: string; version: string } | null {
  const candidates = ["python3", "python"];

  for (const cmd of candidates) {
    try {
      const result = spawnSync(cmd, ["--version"], {
        encoding: "utf-8",
        timeout: 5_000,
        stdio: ["ignore", "pipe", "pipe"],
      });
      if (result.error) continue;
      if (result.status !== 0) continue;
      const version = (result.stdout || result.stderr || "").trim();
      if (version) return { executable: cmd, version };
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Build a structured error response with diagnostic hints.
 */
function errorResponse(
  stage: string,
  error: string,
  stderr: string,
  status = 500,
): NextResponse<ScrapeTriggerErrorResponse> {
  const hint = ERROR_HINTS[stage] ?? {
    probable_cause: "Unknown error during scraper execution.",
    suggested_fix: "Check the run.log and Python environment.",
  };
  const body: ScrapeTriggerErrorResponse = {
    ok: false,
    error,
    stderr: stderr.slice(-4000),
    stage,
    probable_cause: hint.probable_cause,
    suggested_fix: hint.suggested_fix,
  };
  return NextResponse.json(body, { status });
}

/**
 * Known error stages with diagnostic hints.
 */
const ERROR_HINTS: Record<
  string,
  { probable_cause: string; suggested_fix: string }
> = {
  find_python: {
    probable_cause:
      "Neither 'python3' nor 'python' were found in PATH, or they failed to run.",
    suggested_fix:
      "Install Python 3.12+ and ensure it is on your PATH. On Windows, " +
      "check 'python --version' in a terminal. On Linux, check 'python3 --version'.",
  },
  spawn_failed: {
    probable_cause:
      "Python was found but could not spawn the scraper subprocess.",
    suggested_fix:
      "Check that the gbp-monitor directory exists and is accessible. " +
      "Verify the Python module path is correct.",
  },
  non_zero_exit: {
    probable_cause:
      "The scraper exited with a non-zero code. Check the captured stderr " +
      "for Python tracebacks or import errors.",
    suggested_fix:
      "Run the scraper manually from a terminal: " +
      "cd gbp-monitor && python -m orchestration.run_all --fixtures",
  },
  summary_missing: {
    probable_cause:
      "The scraper ran but did not produce data/run_summary.json.",
    suggested_fix:
      "The scraper may have crashed before writing output. Check run.log " +
      "and run the scraper manually to reproduce.",
  },
  summary_corrupt: {
    probable_cause:
      "run_summary.json exists but contains invalid JSON.",
    suggested_fix:
      "Delete data/run_summary.json and re-run the scraper.",
  },
  timeout: {
    probable_cause:
      "The scraper did not complete within 60 seconds.",
    suggested_fix:
      "This is unexpected for --fixtures mode (should finish in <5s). " +
      "Check for infinite loops or hanging Playwright processes.",
  },
};

/**
 * POST /api/scrape/trigger
 *
 * Spawns the Python scraper in `--fixtures` mode and returns the
 * freshly-written run_summary.json. Cross-platform Python discovery.
 */
export async function POST() {
  // `--fixtures` is non-negotiable here: the dashboard must never trigger a
  // live Playwright scrape from a browser click (that's what the GitHub
  // Actions cron is for). Live mode requires Playwright binaries installed
  // on the runner and runs against the real Google Maps DOM, where the
  // UNPROVEN seeded selectors will almost certainly fail.
  const args = ["-m", "orchestration.run_all", "--fixtures"];

  // Step 1 — discover Python executable.
  const python = findPython();
  if (!python) {
    return errorResponse(
      "find_python",
      "No Python executable found. Tried: python3, python.",
      "",
    );
  }

  // Step 2 — verify GBP_ROOT exists.
  let rootExists = false;
  try {
    await fs.access(GBP_ROOT);
    rootExists = true;
  } catch {
    rootExists = false;
  }
  if (!rootExists) {
    return errorResponse(
      "spawn_failed",
      `GBP_ROOT directory does not exist: ${GBP_ROOT}`,
      "",
    );
  }

  // Step 3 — spawn the subprocess.
  let result;
  try {
    result = spawnSync(python.executable, args, {
      cwd: GBP_ROOT,
      encoding: "utf-8",
      timeout: 60_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    return errorResponse(
      "spawn_failed",
      `spawnSync threw: ${err instanceof Error ? err.message : String(err)}`,
      "",
    );
  }

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";

  // Step 4 — handle non-zero exit.
  if (result.error || result.status !== 0) {
    // Distinguish timeout from other errors.
    if (result.error?.name === "TimeoutError" || result.signal === "SIGTERM") {
      return errorResponse("timeout", "Scraper timed out after 60s.", stderr);
    }
    const errorMessage = result.error
      ? result.error.message
      : `exit code ${result.status}`;
    return errorResponse(
      "non_zero_exit",
      `Python exited with ${errorMessage}`,
      stderr,
    );
  }

  // Step 5 — read run_summary.json.
  let summaryJson: string;
  try {
    summaryJson = await fs.readFile(GBP_RUN_SUMMARY_PATH, "utf-8");
  } catch (err) {
    return errorResponse(
      "summary_missing",
      `run_summary.json not found after run: ${
        err instanceof Error ? err.message : String(err)
      }`,
      stderr,
    );
  }

  // Step 6 — parse summary.
  let summary: RunSummary;
  try {
    summary = JSON.parse(summaryJson) as RunSummary;
  } catch (err) {
    return errorResponse(
      "summary_corrupt",
      `run_summary.json is corrupt: ${
        err instanceof Error ? err.message : String(err)
      }`,
      stderr,
    );
  }

  const body: ScrapeTriggerResponse = { ok: true, summary };
  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Also expose a GET handler for health-check / manual curl testing.
 */
export async function GET() {
  const python = findPython();
  if (!python) {
    return NextResponse.json(
      {
        ok: false,
        error: "No Python executable found",
        python_version: null,
        gbp_root: GBP_ROOT,
        platform: process.platform,
      },
      { status: 200 },
    );
  }
  return NextResponse.json({
    ok: true,
    python_executable: python.executable,
    python_version: python.version,
    gbp_root: GBP_ROOT,
    gbp_root_exists: await fs.access(GBP_ROOT).then(() => true).catch(() => false),
    platform: process.platform,
  });
}
