import { NextResponse } from "next/server";

import { sanitizeError } from "@/lib/gbp/sanitize";
import { readActiveBusiness } from "@/lib/gbp/server-data";
import {
  discoverCompetitors,
  persistDiscovered,
  type DiscoveryResult,
} from "@/lib/gbp/osm-discovery";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// In-memory cache so repeated dashboard loads don't hammer Overpass.
const CACHE_TTL_MS = 10 * 60 * 1000;
let _cache: { key: string; ts: number; value: DiscoveryResult } | null = null;

async function runDiscovery(radiusM?: number, persist?: boolean) {
  const active = await readActiveBusiness();
  if (!active) {
    return NextResponse.json(
      { error: "No active business. Complete onboarding first." },
      { status: 409 },
    );
  }

  const key = `${active.id}:${radiusM ?? 800}`;
  const now = Date.now();
  let result = _cache && _cache.key === key && now - _cache.ts < CACHE_TTL_MS ? _cache.value : null;

  if (!result) {
    result = await discoverCompetitors({ radiusM });
    _cache = { key, ts: now, value: result };
  }

  let added = 0;
  if (persist && result.total > 0) {
    const res = await persistDiscovered(result);
    added = res.added;
  }

  return NextResponse.json(
    { ...result, persisted: added },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * GET /api/competitors/discover
 *
 * Automatic, OSM-native competitor discovery. Queries Overpass for nearby
 * same-category businesses around each branch's coordinates (captured at
 * onboarding) — no manual paste and no Google place_id required.
 *
 * Query params:
 *   radius  — search radius in metres (100–5000, default 800)
 *   persist — 1 to merge discovered competitors into the active business's
 *             persisted branch config (geo-grid / correlation can then use them)
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const radiusRaw = parseInt(url.searchParams.get("radius") ?? "", 10);
    const radiusM = Number.isFinite(radiusRaw) && radiusRaw > 0 ? radiusRaw : undefined;
    const persist = url.searchParams.get("persist") === "1";
    return await runDiscovery(radiusM, persist);
  } catch (err) {
    return NextResponse.json(
      { error: "OSM discovery failed", detail: sanitizeError(err) },
      { status: 500 },
    );
  }
}

/** POST mirrors GET for explicit (button-driven) triggers. */
export async function POST(request: Request) {
  try {
    let radiusM: number | undefined;
    let body: { radius?: number; persist?: boolean } = {};
    try {
      body = (await request.json()) as { radius?: number; persist?: boolean };
    } catch {
      // empty body is fine
    }
    if (typeof body.radius === "number" && body.radius > 0) radiusM = body.radius;
    return await runDiscovery(radiusM, body.persist ?? true);
  } catch (err) {
    return NextResponse.json(
      { error: "OSM discovery failed", detail: sanitizeError(err) },
      { status: 500 },
    );
  }
}
