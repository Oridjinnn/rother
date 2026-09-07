import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";

import type { ActiveBusiness, BranchConfig } from "@/lib/gbp/types";
import { GBP_USER_BUSINESS_PATH } from "@/lib/gbp/paths";
import { sanitizeError } from "@/lib/gbp/sanitize";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface BusinessBody {
  id?: string;
  name?: string;
  location?: string;
  category?: string;
  categoryId?: string;
  /** P4 / geo-grid: business HQ coordinates (decimal degrees). */
  lat?: number;
  lng?: number;
  /** Canonical OSM anchor (`osm_type/osm_id`). */
  osm_place_id?: string;
  /** Best-effort Google `ChIJ…` place_id; needed by the review collector. */
  gmaps_place_id?: string | null;
  city?: string;
  country?: string;
  postcode?: string;
  unverified?: boolean;
  /** P2 / tenant scoping: the user's own monitored branches. */
  branches?: BranchConfig[];
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
 * Persist the active user-selected business to `user-business.json` WITHOUT
 * starting a scrape run. Reuses the merge semantics of `persistUserBusiness`
 * in /api/scrape/trigger: an existing id / branches / coords are preserved
 * unless explicitly overridden by the body, and `scrapedAt` is bumped to now.
 *
 * This is the lighter onboarding counterpart to the scrape trigger — it exists
 * so a business (with HQ coordinates for the geo-grid) can be created on day
 * one, before any competitor scrape has run.
 */
async function persistUserBusinessLight(body: BusinessBody): Promise<ActiveBusiness> {
  let existing: Partial<ActiveBusiness> = {};
  try {
    existing = JSON.parse(await fs.readFile(GBP_USER_BUSINESS_PATH, "utf-8"));
  } catch {
    // no prior business file — start fresh
  }
  const business: ActiveBusiness = {
    id: existing.id ?? slugify(body.name ?? "business"),
    name: body.name?.trim() || existing.name || "Your business",
    location: body.location?.trim() || existing.location || "",
    category: body.category ?? existing.category,
    categoryId: body.categoryId ?? existing.categoryId,
    lat: typeof body.lat === "number" ? body.lat : existing.lat,
    lng: typeof body.lng === "number" ? body.lng : existing.lng,
    osm_place_id: body.osm_place_id ?? existing.osm_place_id,
    gmaps_place_id: body.gmaps_place_id !== undefined ? body.gmaps_place_id : existing.gmaps_place_id,
    city: body.city ?? existing.city,
    country: body.country ?? existing.country,
    postcode: body.postcode ?? existing.postcode,
    unverified: body.unverified ?? existing.unverified,
    branches: body.branches ?? existing.branches,
    scrapedAt: new Date().toISOString(),
  };
  await fs.writeFile(
    GBP_USER_BUSINESS_PATH,
    JSON.stringify(business, null, 2),
    "utf-8",
  );
  return business;
}

/**
 * P4 / tenant scoping — create or update the active business from onboarding.
 * Validates the required fields (`name` >= 2 chars, `location` >= 4 chars),
 * then persists to `user-business.json` without triggering a scrape. The
 * branches sub-resource is written separately via /api/business/branches and
 * therefore REQUIRES this endpoint to have run first.
 */
export async function POST(request: Request) {
  let body: BusinessBody;
  try {
    body = (await request.json()) as BusinessBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const location =
    typeof body.location === "string" ? body.location.trim() : "";
  if (name.length < 2 || location.length < 4) {
    return NextResponse.json(
      { error: "name (>= 2 chars) and location (>= 4 chars) are required" },
      { status: 400 },
    );
  }

  try {
    const business = await persistUserBusinessLight(body);
    return NextResponse.json(
      { ok: true, business },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err) },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
