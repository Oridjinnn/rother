import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";

import type { CategoryScanResponse } from "@/lib/gbp/types";
import { GBP_USER_BUSINESS_PATH } from "@/lib/gbp/paths";
import { readActiveBusiness, readCategoryScan } from "@/lib/gbp/server-data";
import { runCategoryScan } from "@/lib/gbp/scrape-runner";
import { sanitizeError } from "@/lib/gbp/sanitize";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface ScanBody {
  category?: string;
  location?: string;
  fixtures?: boolean;
  mode?: "fixtures" | "cached" | "live";
}

/**
 * P1 / RISK-024 — trigger a category discovery scan for the active business.
 *
 * Persists the requested category to `user-business.json` (so the scrape
 * runner / dashboard can re-use it), then runs the scraper-based scan and
 * returns the candidate competitors. Synchronous (awaits the Python process)
 * which is fine for a local single-user app; the result is also persisted to
 * `<data-dir>/category_scan/latest.json` for the GET handler.
 */
export async function POST(request: Request) {
  let body: ScanBody = {};
  try {
    body = (await request.json()) as ScanBody;
  } catch {
    // empty body — fall back to the persisted category/location
  }

  const active = await readActiveBusiness();
  if (!active) {
    return NextResponse.json(
      { error: "No active business. Complete onboarding first." },
      { status: 409 },
    );
  }

  const category = body.category?.trim() || active.category;
  if (!category) {
    return NextResponse.json(
      { error: "A category is required (e.g. 'coffee')." },
      { status: 400 },
    );
  }
  const location = body.location?.trim() || active.location || "";

  // Persist the category so downstream runs can reuse it.
  try {
    const updated = { ...active, category, location };
    await fs.writeFile(
      GBP_USER_BUSINESS_PATH,
      JSON.stringify(updated, null, 2),
      "utf-8",
    );
  } catch {
    // non-fatal — the scan can still run with the inline params
  }

  try {
    const result = await runCategoryScan({
      category,
      location,
      mode: body.mode ?? (body.fixtures ? "fixtures" : "live"),
      fixtures: body.fixtures ?? false,
      businessId: active.id,
    });
    return NextResponse.json(result satisfies CategoryScanResponse, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Category scan failed",
        detail: sanitizeError(err),
      },
      { status: 500 },
    );
  }
}

/** GET — return the most recent category scan for the active business. */
export async function GET() {
  const result = await readCategoryScan();
  if (!result) {
    return NextResponse.json(
      { candidates: [], note: "No category scan has been run yet." },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
