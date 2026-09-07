import { NextResponse } from "next/server";
import { existsSync } from "fs";
import { spawnSync } from "child_process";
import { join } from "path";
import {
  GBP_ROOT,
  GBP_DATA_DIR,
  GBP_LISTINGS_PATH,
  GBP_SELECTORS_PATH,
} from "@/lib/gbp/paths";

const startTime = Date.now();

export const dynamic = "force-dynamic";

/** Local copy of the scraper-runner python detection (kept decoupled). */
function findPython(): string | null {
  for (const cmd of ["python3", "python"]) {
    try {
      const result = spawnSync(cmd, ["--version"], {
        encoding: "utf-8",
        timeout: 5_000,
        stdio: ["ignore", "pipe", "pipe"],
      });
      if (result.error || result.status !== 0) continue;
      return cmd;
    } catch {
      continue;
    }
  }
  return null;
}

// Cache the (expensive-ish) browser probe for the process lifetime so a
// health hit never launches Chromium. Refreshed only on restart.
let _cachedBrowserAvailable: boolean | null = null;

function browserAvailable(): boolean {
  if (_cachedBrowserAvailable !== null) return _cachedBrowserAvailable;
  const python = findPython();
  if (!python) {
    _cachedBrowserAvailable = false;
    return false;
  }
  try {
    const result = spawnSync(
      python,
      ["-m", "harness.browser_capability"],
      {
        cwd: GBP_ROOT,
        encoding: "utf-8",
        timeout: 30_000,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    if (result.error || result.status !== 0) {
      _cachedBrowserAvailable = false;
      return false;
    }
    const out = (result.stdout || "").trim();
    const parsed = out ? JSON.parse(out) : null;
    _cachedBrowserAvailable = !!(parsed && parsed.available);
  } catch {
    _cachedBrowserAvailable = false;
  }
  return _cachedBrowserAvailable;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    environment: process.env.NODE_ENV ?? "development",
    apiKeyConfigured: !!process.env.API_KEY,
    pythonScraperAvailable: existsSync(join(GBP_ROOT, "orchestration", "run_all.py")),
    browserAvailable: browserAvailable(),
    configPresent: {
      listings: existsSync(GBP_LISTINGS_PATH),
      selectors: existsSync(GBP_SELECTORS_PATH),
    },
    dataDirectory: existsSync(GBP_DATA_DIR),
    version: "0.4.2",
  });
}
