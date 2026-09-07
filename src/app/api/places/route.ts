import { NextResponse } from "next/server";
import { promises as fs, readFileSync } from "node:fs";
import path from "node:path";

import type { NormalizedPlace } from "@/lib/gbp/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAPTILER_KEY = process.env.MAPTILER_KEY;
const GEOAPIFY_KEY = process.env.GEOAPIFY_KEY;

const CACHE_DIR = path.join(process.cwd(), ".rother");
const DISK_CACHE_PATH = path.join(CACHE_DIR, "places_cache.json");
const FETCH_TIMEOUT_MS = 4000;
const PROVIDER_MIN_INTERVAL_MS = 700;
// Cache TTLs (D-phase: stale-on-failure + bounded freshness). Positive hits are
// cheap to keep; a "no results" response is negative and must age out fast so a
// transient empty becomes retryable.
const POSITIVE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const NEGATIVE_TTL_MS = 10 * 60 * 1000; // 10 minutes
// Photon bisects business queries toward POIs (shops/amenities) vs. addresses.
const BUSINESS_LAYER = "venue";

interface CacheEntry {
  ts: number;
  places: NormalizedPlace[];
  negative: boolean;
}
const memCache = new Map<string, CacheEntry>();
let diskCache: Record<string, CacheEntry> | null = null;
let diskLoaded = false;
const lastCall: Record<string, number> = {};
// Single-flight: coalesce concurrent identical queries into one upstream call.
const inflight = new Map<string, Promise<NormalizedPlace[]>>();

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "place"
  );
}

function num(v: string | null): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function valid(p: NormalizedPlace): boolean {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    (Boolean(p.formatted_address) || Boolean(p.name))
  );
}

interface RawFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, unknown>;
  context?: Array<{ id?: string; text?: string }>;
  id?: string;
  text?: string;
  place_name?: string;
}

interface GeoResponse {
  features?: RawFeature[];
}

function asStr(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function asNum(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<GeoResponse | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Rother/0.3 (+local)", ...headers },
    });
    if (!res.ok) return null;
    return (await res.json()) as GeoResponse;
  } finally {
    clearTimeout(t);
  }
}

async function throttle(provider: string): Promise<void> {
  const last = lastCall[provider] ?? 0;
  const wait = PROVIDER_MIN_INTERVAL_MS - (Date.now() - last);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall[provider] = Date.now();
}

async function photon(q: string, lat?: number, lng?: number, limit = 6, layer?: string): Promise<NormalizedPlace[]> {
  const u = new URL("https://photon.komoot.io/api/");
  u.searchParams.set("q", q);
  u.searchParams.set("limit", String(limit));
  // Business mode biases toward venues (shops/amenities/etc.) instead of streets.
  if (layer) u.searchParams.set("layer", layer);
  if (lat != null && lng != null) {
    u.searchParams.set("lat", String(lat));
    u.searchParams.set("lon", String(lng));
  }
  const data = await fetchJson(u.toString());
  const features = data?.features ?? [];
  return features
    .map((f) => {
      const p = f.properties ?? {};
      const [lon, la] = f.geometry?.coordinates ?? [];
      return {
        place_id: `${asStr(p.osm_type) ?? "osm"}/${asStr(p.osm_id) ?? slugify(q)}`,
        name: asStr(p.name) ?? null,
        formatted_address: asStr(p.display_name) ?? "",
        lat: asNum(la) ?? 0,
        lng: asNum(lon) ?? 0,
        city: asStr(p.city),
        country: asStr(p.country),
        postcode: asStr(p.postcode),
        category: p.osm_key && p.osm_value ? `${asStr(p.osm_key)}/${asStr(p.osm_value)}` : undefined,
        provider: "photon",
      } satisfies NormalizedPlace;
    })
    .filter(valid);
}

async function maptiler(q: string, key: string, lat?: number, lng?: number, limit = 6): Promise<NormalizedPlace[]> {
  const prox = lat != null && lng != null ? `&proximity=${lng},${lat}` : "";
  const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json?key=${key}&limit=${limit}${prox}`;
  const data = await fetchJson(url);
  const features = data?.features ?? [];
  return features
    .map((f) => {
      const p = f.properties ?? {};
      const [lon, la] = f.geometry?.coordinates ?? [];
      const ctx = f.context ?? [];
      const country = ctx.find((c) => c.id?.startsWith("country"))?.text;
      const city = ctx.find((c) => c.id?.startsWith("place") || c.id?.startsWith("locality"))?.text;
      const osmId = asStr(p.osm_id) ?? asStr(p.osm_value);
      return {
        place_id: osmId ? `osm/${osmId}` : `maptiler/${f.id ?? slugify(q)}`,
        name: asStr(f.text) ?? asStr(p.name) ?? null,
        formatted_address: asStr(f.place_name) ?? "",
        lat: asNum(la) ?? 0,
        lng: asNum(lon) ?? 0,
        city,
        country,
        postcode: asStr(p.postcode),
        category: p.osm_key && p.osm_value ? `${asStr(p.osm_key)}/${asStr(p.osm_value)}` : undefined,
        provider: "maptiler",
      } satisfies NormalizedPlace;
    })
    .filter(valid);
}

async function geoapify(q: string, key: string, lat?: number, lng?: number, limit = 6): Promise<NormalizedPlace[]> {
  const u = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
  u.searchParams.set("text", q);
  u.searchParams.set("apiKey", key);
  u.searchParams.set("limit", String(limit));
  if (lat != null && lng != null) {
    u.searchParams.set("lat", String(lat));
    u.searchParams.set("lon", String(lng));
  }
  const data = await fetchJson(u.toString());
  const features = data?.features ?? [];
  return features
    .map((f) => {
      const p = f.properties ?? {};
      const [lon, la] = f.geometry?.coordinates ?? [];
      const osmType = asStr(p.osm_type);
      const osmId = asStr(p.osm_id);
      return {
        place_id: osmType && osmId ? `${osmType}/${osmId}` : `geoapify/${f.id ?? slugify(q)}`,
        name: asStr(p.name) ?? null,
        formatted_address: asStr(p.formatted) ?? "",
        lat: asNum(la) ?? 0,
        lng: asNum(lon) ?? 0,
        city: asStr(p.city),
        country: asStr(p.country),
        postcode: asStr(p.postcode),
        category: p.osm_key && p.osm_value ? `${asStr(p.osm_key)}/${asStr(p.osm_value)}` : undefined,
        provider: "geoapify",
      } satisfies NormalizedPlace;
    })
    .filter(valid);
}

async function queryChain(
  q: string,
  lat?: number,
  lng?: number,
  limit = 6,
  layer?: string,
): Promise<NormalizedPlace[]> {
  const providers: Array<() => Promise<NormalizedPlace[]>> = [
    async () => {
      await throttle("photon");
      return photon(q, lat, lng, limit, layer);
    },
  ];
  if (MAPTILER_KEY) {
    providers.push(async () => {
      await throttle("maptiler");
      return maptiler(q, MAPTILER_KEY!, lat, lng, limit);
    });
  }
  if (GEOAPIFY_KEY) {
    providers.push(async () => {
      await throttle("geoapify");
      return geoapify(q, GEOAPIFY_KEY!, lat, lng, limit);
    });
  }
  const merged: NormalizedPlace[] = [];
  const seen = new Set<string>();
  // Business mode: prefer a provider that returns POI-class results; only fall
  // back to the next provider (or keep address-class hits) when none match.
  let anyPoi = false;
  for (const run of providers) {
    try {
      const results = await run();
      for (const r of results) {
        if (!seen.has(r.place_id)) {
          seen.add(r.place_id);
          merged.push(r);
          if (r.category) anyPoi = true;
        }
      }
      if (merged.length > 0 && (layer !== BUSINESS_LAYER || anyPoi)) return merged;
    } catch {
      continue;
    }
  }
  return merged;
}

function cacheKey(q: string, lat?: number, lng?: number, limit = 6, mode = "business"): string {
  return `${q.toLowerCase()}|${lat ?? ""}|${lng ?? ""}|${limit}|${mode}`;
}

function getCache(key: string): { places: NormalizedPlace[]; stale: boolean } | null {
  const read = (): CacheEntry | undefined => {
    if (memCache.has(key)) return memCache.get(key)!;
    if (diskCache && diskCache[key]) {
      memCache.set(key, diskCache[key]);
      return diskCache[key];
    }
    return undefined;
  };
  const entry = read();
  if (!entry) return null;
  const age = Date.now() - entry.ts;
  const ttl = entry.negative ? NEGATIVE_TTL_MS : POSITIVE_TTL_MS;
  return { places: entry.places, stale: age > ttl };
}

function setCache(key: string, value: NormalizedPlace[], negative: boolean): void {
  if (memCache.size >= 500) {
    const first = memCache.keys().next().value;
    if (first) memCache.delete(first);
  }
  memCache.set(key, { ts: Date.now(), places: value, negative });
  loadDiskSync();
  if (!diskCache) diskCache = {};
  diskCache![key] = { ts: Date.now(), places: value, negative };
  void persistDisk();
}

function loadDiskSync(): void {
  if (diskLoaded) return;
  diskLoaded = true;
  try {
    diskCache = JSON.parse(readFileSync(DISK_CACHE_PATH, "utf-8"));
  } catch {
    diskCache = {};
  }
}

async function persistDisk(): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(DISK_CACHE_PATH, JSON.stringify(diskCache ?? {}), "utf-8");
  } catch {
  }
}

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const lat = num(url.searchParams.get("lat"));
  const lng = num(url.searchParams.get("lng"));
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "6", 10);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 6, 1), 20);
  const manual = url.searchParams.get("manual") === "1";
  // mode=business biases toward POIs (the onboarding "your business" path);
  // mode=address does a plain geocode (branch address entry). Defaults to business.
  const mode = url.searchParams.get("mode") === "address" ? "address" : "business";
  const layer = mode === "business" ? BUSINESS_LAYER : undefined;

  // Sub-path: expand a short Google Maps link server-side. The browser cannot
  // touch Google directly (CSP), and short links (maps.app.goo.gl) carry no
  // parseable token client-side. We follow redirects, then forward-geocode.
  if (url.searchParams.get("path") === "expand") {
    try {
      const expanded = await expandShortLink(q);
      return NextResponse.json({ ...expanded, expanded: true }, { headers });
    } catch {
      return NextResponse.json(
        { places: [], provider: "none", expanded: true, error: "could_not_expand" },
        { status: 422, headers },
      );
    }
  }

  if (manual) {
    const place: NormalizedPlace = {
      place_id: `manual/${slugify(q)}`,
      name: q || null,
      formatted_address: q,
      lat: lat ?? 0,
      lng: lng ?? 0,
      provider: "manual",
      unverified: true,
    };
    return NextResponse.json({ places: [place], provider: "manual", manual: true }, { headers });
  }

  if (q.length < 2) {
    return NextResponse.json(
      { places: [], provider: "none", note: "query too short" },
      { headers },
    );
  }

  const key = cacheKey(q, lat, lng, limit, mode);
  const cached = getCache(key);
  if (cached && !cached.stale) {
    return NextResponse.json(
      { places: cached.places, provider: cached.places[0]?.provider ?? "cache", cached: true },
      { headers },
    );
  }

  // Single-flight: if an identical query is already in flight, await it rather
  // than hammering Photon from concurrent keystrokes/branches.
  const existing = inflight.get(key);
  if (existing) {
    const places = await existing;
    return NextResponse.json(
      { places, provider: places[0]?.provider ?? "cache", cached: false, coalesced: true },
      { headers },
    );
  }

  const promise = (async () => {
    const places = await queryChain(q, lat, lng, limit, layer);
    if (places.length > 0) setCache(key, places, false);
    else if (!cached) setCache(key, [], true); // negative cache, short TTL
    return places;
  })();

  inflight.set(key, promise);
  try {
    const places = await promise;
    return NextResponse.json(
      { places, provider: places[0]?.provider ?? "none" },
      { headers },
    );
  } finally {
    inflight.delete(key);
  }
}

/**
 * Follow a Google Maps short link (maps.app.goo.gl / goo.gl/maps) and extract
 * either a `ChIJ…` place_id or `@lat,lng` coordinates, then forward-geocode the
 * coordinates into a normalized OSM-backed place. Returns the same shape the
 * caller expects from a normal query so PasteFromMaps can consume it uniformly.
 */
async function expandShortLink(input: string): Promise<{ places: NormalizedPlace[]; provider: string }> {
  const SHORT_HOSTS = ["maps.app.goo.gl", "goo.gl", "maps.google.com", "www.google.com", "google.com"];
  let target: string | null = null;
  try {
    const u = new URL(input);
    if (SHORT_HOSTS.includes(u.hostname.replace(/^www\./, ""))) target = input;
  } catch {
    target = null;
  }
  if (!target) {
    // Already a full maps URL — let the parser path handle it; return empty here.
    return { places: [], provider: "none" };
  }

  // Follow redirects without loading the body.
  let resolved = target;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(target, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": "Rother/0.3 (+local)" },
    });
    resolved = res.url;
    clearTimeout(t);
  } catch {
    // keep `target` as best effort
  }

  const pid = resolved.match(/place_id:([A-Za-z0-9_-]{20,})/) ??
    resolved.match(/\/maps\/place\/[^/]+\/([A-Za-z0-9_-]{20,})/) ??
    resolved.match(/ChIJ[A-Za-z0-9_-]{20,}/);
  const at = resolved.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const latF = at ? Number(at[1]) : undefined;
  const lngF = at ? Number(at[2]) : undefined;

  // Prefer forward-geocoding coordinates into a real OSM place.
  if (typeof latF === "number" && typeof lngF === "number") {
    const places = await queryChain(`${latF},${lngF}`, latF, lngF, 1);
    if (places.length > 0) return { places, provider: places[0].provider };
    const place: NormalizedPlace = {
      place_id: pid ? `gmaps/${pid[1]}` : `coord/${latF},${lngF}`,
      name: null,
      formatted_address: `${latF}, ${lngF}`,
      lat: latF,
      lng: lngF,
      provider: "gmaps-coords",
      unverified: true,
    };
    return { places: [place], provider: "gmaps-coords" };
  }
  if (pid) {
    return {
      places: [
        {
          place_id: `gmaps/${pid[1]}`,
          name: null,
          formatted_address: "",
          lat: 0,
          lng: 0,
          provider: "gmaps",
          unverified: true,
        },
      ],
      provider: "gmaps",
    };
  }
  return { places: [], provider: "none" };
}

export async function POST() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
