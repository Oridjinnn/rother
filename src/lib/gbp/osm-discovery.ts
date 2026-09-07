/**
 * Automatic, OSM-native competitor discovery.
 *
 * Instead of relying on the (fragile, ToS-bound) Google scraper, this module
 * queries the public OpenStreetMap Overpass API for nearby businesses that
 * share the active business's category, using the branch coordinates that
 * onboarding already captured. No manual paste, no Google place_id required.
 *
 * The result is the canonical `osm_place_id` anchor for each discovered
 * competitor, which downstream features (geo-grid, future enrichment) can use.
 */

import "server-only";
import type {
  BranchConfig,
  CompetitorConfig,
} from "./types";
import {
  readActiveBusiness,
  readActiveBusinessBranches,
  writeActiveBusinessBranches,
} from "./server-data";

export interface OsmCompetitor {
  /** Canonical OSM anchor: `${osm_type}/${osm_id}` (e.g. "node/123456"). */
  osm_place_id: string;
  name: string | null;
  lat: number;
  lng: number;
  /** Great-circle distance from the querying branch, in metres. */
  distanceM: number;
  category?: string;
  tags: Record<string, string>;
}

export interface BranchDiscovery {
  branch_id: string;
  branch_name: string;
  lat: number | null;
  lng: number | null;
  competitors: OsmCompetitor[];
}

export interface DiscoveryResult {
  discoveredAt: string;
  radiusM: number;
  branches: BranchDiscovery[];
  total: number;
  /** True when at least one branch had coordinates to query around. */
  queried: boolean;
}

const DEFAULT_RADIUS_M = 800;
const MAX_RESULTS_PER_QUERY = 200;
const OVERPASS_TIMEOUT_MS = 25_000;

/** Overpass endpoints, tried in order. Public, no key required. */
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

/** Map a category (app label or `key/value`) to Overpass tag filters. */
function osmTagFilters(category?: string): string[] {
  if (category && category.includes("/")) {
    const [k, v] = category.split("/", 2);
    return [`["${k}"="${v}"]`];
  }
  const c = (category ?? "").toLowerCase();
  if (/(cafe|coffee)/.test(c)) {
    return ['["amenity"="cafe"]', '["amenity"="coffee_shop"]'];
  }
  if (/restaurant|food|dining|eat/.test(c)) {
    return ['["amenity"="restaurant"]', '["amenity"="fast_food"]'];
  }
  if (/bar|pub|night|drink/.test(c)) {
    return ['["amenity"="bar"]', '["amenity"="pub"]', '["amenity"="biergarten"]'];
  }
  if (/hotel|lodging|stay|hostel|guest/.test(c)) {
    return ['["tourism"="hotel"]', '["tourism"="guest_house"]', '["tourism"="hostel"]'];
  }
  if (/shop|store|retail|market/.test(c)) {
    return ['["shop"~".*"]'];
  }
  if (/school|education|university|college/.test(c)) {
    return ['["amenity"~"school|university|college"]'];
  }
  // Generic fallback: any named point of interest.
  return ['["name"]["amenity"]', '["name"]["shop"]', '["name"]["tourism"]', '["name"]["leisure"]'];
}

function buildOverpassQuery(lat: number, lng: number, radiusM: number, category?: string): string {
  const filters = osmTagFilters(category);
  const around = `(around:${radiusM},${lat},${lng})`;
  const parts: string[] = [];
  for (const f of filters) {
    parts.push(`node${f}${around};`);
    parts.push(`way${f}${around};`);
    parts.push(`relation${f}${around};`);
  }
  return `[out:json][timeout:25];(${parts.join("")});out center ${MAX_RESULTS_PER_QUERY};`;
}

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

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

async function fetchOverpass(query: string): Promise<OverpassElement[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);
  let lastErr: unknown;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
        signal: controller.signal,
      });
      if (!res.ok) {
        lastErr = new Error(`Overpass ${endpoint} → ${res.status}`);
        continue;
      }
      const json = (await res.json()) as { elements?: OverpassElement[] };
      clearTimeout(timer);
      return json.elements ?? [];
    } catch (err) {
      lastErr = err;
    }
  }
  clearTimeout(timer);
  throw lastErr instanceof Error ? lastErr : new Error("Overpass query failed");
}

async function discoverForBranch(
  branch: BranchConfig,
  category: string | undefined,
  radiusM: number,
  selfOsmId: string | undefined,
): Promise<OsmCompetitor[]> {
  const lat = branch.lat;
  const lng = branch.lng;
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return [];
  }

  const query = buildOverpassQuery(lat, lng, radiusM, category);
  const elements = await fetchOverpass(query);

  const seen = new Set<string>();
  const out: OsmCompetitor[] = [];
  for (const el of elements) {
    const elLat = el.lat ?? el.center?.lat;
    const elLng = el.lon ?? el.center?.lon;
    if (typeof elLat !== "number" || typeof elLng !== "number") continue;
    const osmId = `${el.type}/${el.id}`;
    if (osmId === selfOsmId) continue;
    if (seen.has(osmId)) continue;
    seen.add(osmId);
    const name = el.tags?.name ?? null;
    // Skip unnamed POIs in dense fallback categories (noise reduction).
    if (!name && category === undefined) continue;
    out.push({
      osm_place_id: osmId,
      name,
      lat: elLat,
      lng: elLng,
      distanceM: Math.round(haversineM(lat, lng, elLat, elLng)),
      category: el.tags?.amenity ?? el.tags?.shop ?? el.tags?.tourism ?? undefined,
      tags: el.tags ?? {},
    });
  }
  // Closest first; unnamed last.
  out.sort((a, b) => {
    if (!!a.name !== !!b.name) return a.name ? -1 : 1;
    return a.distanceM - b.distanceM;
  });
  return out;
}

/** Discover competitors for every branch with coordinates. Automatic. */
export async function discoverCompetitors(opts?: {
  radiusM?: number;
  category?: string;
}): Promise<DiscoveryResult> {
  const radiusM = Math.min(Math.max(opts?.radiusM ?? DEFAULT_RADIUS_M, 100), 5000);
  const active = await readActiveBusiness();
  if (!active) {
    return { discoveredAt: new Date().toISOString(), radiusM, branches: [], total: 0, queried: false };
  }
  const category = opts?.category ?? active.category;
  const branches = await readActiveBusinessBranches();

  const branchesOut: BranchDiscovery[] = [];
  let total = 0;
  let queried = false;
  for (const branch of branches) {
    const comps = await discoverForBranch(branch, category, radiusM, branch.osm_place_id);
    if (comps.length > 0) queried = true;
    total += comps.length;
    branchesOut.push({
      branch_id: branch.branch_id,
      branch_name: branch.branch_name,
      lat: typeof branch.lat === "number" ? branch.lat : null,
      lng: typeof branch.lng === "number" ? branch.lng : null,
      competitors: comps,
    });
  }

  return {
    discoveredAt: new Date().toISOString(),
    radiusM,
    branches: branchesOut,
    total,
    queried,
  };
}

/** Merge discovered competitors into the active business's persisted branches. */
export async function persistDiscovered(
  result: DiscoveryResult,
): Promise<{ added: number; branches: BranchConfig[] }> {
  const branches = await readActiveBusinessBranches();
  const byId = new Map(branches.map((b) => [b.branch_id, b]));
  let added = 0;

  for (const disc of result.branches) {
    const branch = byId.get(disc.branch_id);
    if (!branch) continue;
    if (!Array.isArray(branch.competitors)) branch.competitors = [];
    const existingOsm = new Set(
      branch.competitors
        .map((c) => c.osm_place_id)
        .filter((x): x is string => typeof x === "string"),
    );
    const existingIds = new Set(branch.competitors.map((c) => c.competitor_id));
    for (const comp of disc.competitors) {
      if (existingOsm.has(comp.osm_place_id)) continue;
      const competitorId = `osm-${comp.osm_place_id.replace("/", "-")}`;
      if (existingIds.has(competitorId)) continue;
      const config: CompetitorConfig = {
        competitor_id: competitorId,
        name: comp.name ?? "Unnamed competitor",
        gmaps_url: "",
        place_id: comp.osm_place_id,
        osm_place_id: comp.osm_place_id,
        lat: comp.lat,
        lng: comp.lng,
        verified: false,
        category: comp.category,
      };
      branch.competitors.push(config);
      existingOsm.add(comp.osm_place_id);
      existingIds.add(competitorId);
      added++;
    }
  }

  if (added > 0) {
    await writeActiveBusinessBranches(branches);
  }
  return { added, branches };
}
