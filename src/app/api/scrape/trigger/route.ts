import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";

import type {
  ActiveBusiness,
  ScrapeTriggerAsyncResponse,
  ScrapeTriggerErrorResponse,
} from "@/lib/gbp/types";
import { GBP_USER_BUSINESS_PATH } from "@/lib/gbp/paths";
import { scrapeRunManager } from "@/lib/gbp/scrape-runner";
import { sanitizeError } from "@/lib/gbp/sanitize";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface TriggerBody {
  name?: string;
  location?: string;
  category?: string;
  categoryId?: string;
  /** Google Maps place_id for the single-path scraper. */
  placeId?: string;
  place_id?: string;
  /** Canonical OSM anchor (`osm_type/osm_id`) resolved during onboarding. */
  osm_place_id?: string;
  /** Best-effort Google `ChIJ…` place_id; preferred over place_id by the collector. */
  gmaps_place_id?: string | null;
  /** P4 / geo-grid: business HQ coordinates. */
  lat?: number;
  lng?: number;
  city?: string;
  country?: string;
  postcode?: string;
  unverified?: boolean;
  /** P2 / tenant scoping: the user's own monitored branches/competitors. */
  branches?: import("@/lib/gbp/types").BranchConfig[];
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "business"
  );
}

/**
 * Persist the user's selected business as the single active scrape target.
 * Written BEFORE the scrape is attempted so that, even if the live run fails,
 * the dashboard scopes to the user's business (and never falls back to the
 * seeded Copenhagen Bali demo).
 */
async function persistUserBusiness(body: TriggerBody): Promise<ActiveBusiness> {
  // Preserve any previously-stored branches/coords so re-triggering does not
  // wipe the user's tenant config (P2).
  let existing: Partial<ActiveBusiness> = {};
  try {
    existing = JSON.parse(await fs.readFile(GBP_USER_BUSINESS_PATH, "utf-8"));
  } catch {
    // no prior business file
  }
  const id = existing.id ?? slugify(body.name ?? "business");
  const placeId = body.placeId ?? body.place_id ?? existing.place_id;
  const gmapsId = body.gmaps_place_id ?? existing.gmaps_place_id ?? placeId ?? null;
  const osmId = body.osm_place_id ?? existing.osm_place_id;

  // Ensure at least one branch + competitor exists so the dashboard's
  // /api/overview (which joins snapshots against the active business branches)
  // renders the scraped reviews. The competitor_id matches the scraper's
  // output directory name (== business id) so Overview's per-competitor stats
  // and "new reviews" line up with the collected snapshot.
  const branches: import("@/lib/gbp/types").BranchConfig[] =
    body.branches ??
    existing.branches ??
    [
      {
        branch_id: id,
        branch_name: body.name?.trim() || existing.name || "Your business",
        competitors: [
          {
            competitor_id: id,
            name: body.name?.trim() || existing.name || "Your business",
            gmaps_url: placeId
              ? `https://www.google.com/maps/place/?q=place_id:${placeId}`
              : "",
            place_id: placeId ?? null,
            verified: false,
          },
        ],
      },
    ];

  const business: ActiveBusiness = {
    id,
    name: body.name?.trim() || existing.name || "Your business",
    location: body.location?.trim() || existing.location || "",
    category: body.category ?? existing.category,
    categoryId: body.categoryId ?? existing.categoryId,
    place_id: placeId,
    osm_place_id: osmId,
    gmaps_place_id: gmapsId,
    lat: typeof body.lat === "number" ? body.lat : existing.lat,
    lng: typeof body.lng === "number" ? body.lng : existing.lng,
    city: body.city ?? existing.city,
    country: body.country ?? existing.country,
    postcode: body.postcode ?? existing.postcode,
    unverified: body.unverified ?? existing.unverified,
    branches,
    scrapedAt: new Date().toISOString(),
  };
  await fs.writeFile(GBP_USER_BUSINESS_PATH, JSON.stringify(business, null, 2), "utf-8");
  return business;
}

export async function POST(request?: Request) {
  let mode = "live";
  if (request) {
    const url = new URL(request.url);
    // Allow ?mode=fixtures override for local testing; default is live.
    mode = url.searchParams.get("mode") || "live";
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

  // Capture the user's business from the request body (if provided) and persist
  // it as the active target. This is the documented "point the scraper at the
  // user's business" step. Scoping the Python orchestrator to this business for
  // arbitrary real competitors is the separate follow-up (RISK-024 / Strategic S).
  let activeBusiness: ActiveBusiness | null = null;
  if (request) {
    try {
      const body = (await request.json()) as TriggerBody;
      if (body && (body.name || body.location || body.category || body.placeId || body.place_id)) {
        activeBusiness = await persistUserBusiness(body);
      }
    } catch {
      // No/invalid body — fall through; the run will use whatever target exists.
    }
  }

  let runId: string;
  try {
    const result = await scrapeRunManager.start(mode as "fixtures" | "live");
    if (result === null) {
      // A previous run is still active. The active target is already persisted
      // (above), so we report busy rather than blocking the user.
      return NextResponse.json(
        {
          ok: false,
          error: "A scrape run is already in progress. Wait for it to complete before triggering another.",
          stderr: "",
          stage: "concurrent_run",
          probable_cause: "A previous scrape run is still active.",
          suggested_fix: "Wait for the current run to finish, or check /api/scrape/status for progress.",
        } satisfies ScrapeTriggerErrorResponse,
        { status: 409 },
      );
    }
    runId = result;
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

  const body: ScrapeTriggerAsyncResponse = {
    ok: true,
    runId,
    ...(activeBusiness ? { business: activeBusiness } : {}),
  } as ScrapeTriggerAsyncResponse & { business?: ActiveBusiness };
  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
