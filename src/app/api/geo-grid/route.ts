import { NextResponse } from "next/server";

import type {
  GeoBounds,
  GeoGridCell,
  GeoGridResponse,
  GeoPoint,
} from "@/lib/gbp/types";
import { readActiveBusiness, readActiveBusinessBranches } from "@/lib/gbp/server-data";
import { geocodeFromGmapsUrl } from "@/lib/gbp/geocode";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const GRID_DIM = 5;

/**
 * P4 / geo-grid — return every mapped point for the active business (HQ,
 * branches, and competitors) plus a uniform competitive "grid" overlay.
 *
 * Coordinates come from (in priority order): explicit `lat`/`lng` on the
 * config ("config"), or derived from the Google Maps URL ("url_geocode").
 * Points with no resolvable coordinates are still returned (source
 * "unknown") so the UI can prompt the user, but they are excluded from the
 * grid bounds / cells.
 */
export async function GET() {
  const branches = await readActiveBusinessBranches();
  const active = await readActiveBusiness();
  const points: GeoPoint[] = [];

  if (
    active &&
    typeof active.lat === "number" &&
    typeof active.lng === "number" &&
    Number.isFinite(active.lat) &&
    Number.isFinite(active.lng)
  ) {
    points.push({
      id: active.id,
      label: active.name,
      kind: "business",
      lat: active.lat,
      lng: active.lng,
      source: "config",
    });
  }

  for (const branch of branches) {
    const branchCoord = resolveCoord(branch.lat, branch.lng, undefined);
    if (branchCoord) {
      points.push({
        id: branch.branch_id,
        label: branch.branch_name,
        kind: "branch",
        lat: branchCoord.lat,
        lng: branchCoord.lng,
        source: branchCoord.source,
      });
    }
    for (const comp of branch.competitors) {
      const coord = resolveCoord(comp.lat, comp.lng, comp.gmaps_url);
      points.push({
        id: comp.competitor_id,
        label: comp.name,
        kind: "competitor",
        lat: coord?.lat ?? 0,
        lng: coord?.lng ?? 0,
        rating: undefined,
        source: coord?.source ?? "unknown",
      });
    }
  }

  const known = points.filter(
    (p) => p.source !== "unknown" && Number.isFinite(p.lat) && Number.isFinite(p.lng),
  );

  const bounds: GeoBounds | null =
    known.length > 0
      ? {
          minLat: Math.min(...known.map((p) => p.lat)),
          maxLat: Math.max(...known.map((p) => p.lat)),
          minLng: Math.min(...known.map((p) => p.lng)),
          maxLng: Math.max(...known.map((p) => p.lng)),
        }
      : null;

  const cells: GeoGridCell[] = [];
  if (bounds) {
    const padLat = Math.max((bounds.maxLat - bounds.minLat) * 0.1, 1e-4);
    const padLng = Math.max((bounds.maxLng - bounds.minLng) * 0.1, 1e-4);
    const minLat = bounds.minLat - padLat;
    const maxLat = bounds.maxLat + padLat;
    const minLng = bounds.minLng - padLng;
    const maxLng = bounds.maxLng + padLng;
    const latStep = (maxLat - minLat) / GRID_DIM;
    const lngStep = (maxLng - minLng) / GRID_DIM;
    for (let r = 0; r < GRID_DIM; r++) {
      for (let c = 0; c < GRID_DIM; c++) {
        const cellMinLat = minLat + r * latStep;
        const cellMaxLat = cellMinLat + latStep;
        const cellMinLng = minLng + c * lngStep;
        const cellMaxLng = cellMinLng + lngStep;
        const count = known.filter(
          (p) =>
            p.lat >= cellMinLat &&
            p.lat < cellMaxLat &&
            p.lng >= cellMinLng &&
            p.lng < cellMaxLng,
        ).length;
        cells.push({
          row: r,
          col: c,
          minLat: cellMinLat,
          maxLat: cellMaxLat,
          minLng: cellMinLng,
          maxLng: cellMaxLng,
          pointCount: count,
        });
      }
    }
  }

  const response: GeoGridResponse = {
    points,
    bounds,
    grid: { rows: GRID_DIM, cols: GRID_DIM, cells },
  };
  return NextResponse.json(response, {
    headers: { "Cache-Control": "no-store" },
  });
}

function resolveCoord(
  lat: number | undefined,
  lng: number | undefined,
  url: string | undefined,
): { lat: number; lng: number; source: "config" | "url_geocode" } | null {
  if (typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng, source: "config" };
  }
  const geo = geocodeFromGmapsUrl(url);
  if (geo) return { ...geo, source: "url_geocode" };
  return null;
}
