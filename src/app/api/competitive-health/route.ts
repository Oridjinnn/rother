import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";

import { sanitizeError } from "@/lib/gbp/sanitize";
import {
  readActiveBusiness,
  readActiveBusinessBranches,
  assessDataStatus,
  readAllSnapshots,
} from "@/lib/gbp/server-data";
import { parseRunSummaryLine } from "@/lib/gbp/health-trend";
import { GBP_RUN_LOG_PATH } from "@/lib/gbp/paths";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function km2(radiusM: number): number {
  return (Math.PI * radiusM * radiusM) / 1_000_000;
}

interface BranchHealth {
  branch_id: string;
  branch_name: string;
  competitorCount: number;
  nearestM: number | null;
  densityPerKm2: number | null;
  enriched: number;
}

/**
 * GET /api/competitive-health
 *
 * Fused "competitive health" snapshot combining:
 *   - automatic OSM discovery totals (competitors, nearest, density, enrichment)
 *   - correlation readiness (≥2 competitors with review snapshots)
 *   - last run health level + data-layer status
 *
 * Reads the persisted competitor set (populated by /api/competitors/discover),
 * so it is cheap and never hits Overpass directly.
 */
export async function GET() {
  try {
    const active = await readActiveBusiness();
    if (!active) {
      return NextResponse.json(
        { error: "No active business. Complete onboarding first." },
        { status: 409 },
      );
    }

    const branches = await readActiveBusinessBranches();
    const [dataStatus, snapshots] = await Promise.all([
      assessDataStatus(active.id),
      readAllSnapshots(active.id),
    ]);

    let totalCompetitors = 0;
    let totalEnriched = 0;
    let osmMined = 0;
    let minNearest: number | null = null;
    let maxDistForDensity = 1;
    let competitorsWithReviews = 0;

    const branchHealth: BranchHealth[] = [];

    for (const branch of branches) {
      const comps = branch.competitors ?? [];
      const branchLat = typeof branch.lat === "number" ? branch.lat : null;
      const branchLng = typeof branch.lng === "number" ? branch.lng : null;

      let nearest: number | null = null;
      let enriched = 0;
      for (const c of comps) {
        if (c.osm_place_id) osmMined++;
        if (c.place_id) enriched++;
        if (branchLat !== null && branchLng !== null && typeof c.lat === "number" && typeof c.lng === "number") {
          const d = haversineM(branchLat, branchLng, c.lat, c.lng);
          if (nearest === null || d < nearest) nearest = d;
        }
        const revs = snapshots.get(c.competitor_id);
        if (revs && revs.length > 0) competitorsWithReviews++;
      }

      totalCompetitors += comps.length;
      totalEnriched += enriched;
      if (nearest !== null) {
        if (minNearest === null || nearest < minNearest) minNearest = nearest;
        if (nearest > maxDistForDensity) maxDistForDensity = nearest;
      }

      branchHealth.push({
        branch_id: branch.branch_id,
        branch_name: branch.branch_name,
        competitorCount: comps.length,
        nearestM: nearest,
        densityPerKm2: comps.length > 0 ? Math.round(comps.length / km2(maxDistForDensity) * 10) / 10 : null,
        enriched,
      });
    }

    const density = totalCompetitors > 0
      ? Math.round((totalCompetitors / km2(maxDistForDensity)) * 10) / 10
      : null;

    // Last run health level from run.log.
    let health: { level: string; success: number; failed: number; skipped: number } | null = null;
    try {
      const log = await fs.readFile(GBP_RUN_LOG_PATH, "utf-8").catch(() => "");
      const lines = log.split("\n").reverse();
      for (const line of lines) {
        const pt = parseRunSummaryLine(line);
        if (pt) {
          health = { level: pt.level, success: pt.success, failed: pt.failed, skipped: pt.skipped };
          break;
        }
      }
    } catch {
      // no health yet
    }

    const response = {
      discoveredAt: active.scrapedAt ?? null,
      hasCompetitors: totalCompetitors > 0,
      source: osmMined > 0 ? "osm" : "none",
      osmMined,
      totals: {
        competitors: totalCompetitors,
        branches: branches.length,
        nearestM: minNearest,
        densityPerKm2: density,
        enriched: totalEnriched,
        enrichedPct: totalCompetitors > 0 ? Math.round((totalEnriched / totalCompetitors) * 100) : 0,
      },
      branches: branchHealth,
      correlationAvailable: competitorsWithReviews >= 2,
      health,
      dataStatus,
    };

    return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: "competitive-health query failed", detail: sanitizeError(err) },
      { status: 500 },
    );
  }
}
