import type { GmapsResolution } from "@/lib/gbp/types";

const PLACE_ID_RE = /^ChIJ[A-Za-z0-9_-]{20,}$/;

/**
 * Normalized token overlap (0..1) between two names. Used to score how
 * confident a Places-API match is against the OSM name we already have.
 */
export function nameSimilarity(a: string, b: string): number {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(Boolean);
  const ta = norm(a);
  const tb = new Set(norm(b));
  if (ta.length === 0 || tb.size === 0) return 0;
  let hits = 0;
  for (const tok of ta) if (tb.has(tok)) hits++;
  return Math.min(1, hits / ta.length);
}

export function isValidGmapsId(id: string | null | undefined): id is string {
  return typeof id === "string" && PLACE_ID_RE.test(id);
}

export interface ResolveInput {
  name: string | null;
  lat?: number;
  lng?: number;
  /** T1: a Google id already supplied by the user (pasted Maps link). */
  existingGmapsId?: string | null;
  /** T3: flagged scrape path — OFF by default (§5 decision #2). */
  allowScrape?: boolean;
}

export function unresolvedResolution(method: GmapsResolution["method"] = "none"): GmapsResolution {
  return { status: "unresolved", method, confidence: 0 };
}

/**
 * Tiered OSM→Google resolver (Phase 2, F2). Never throws and never blocks
 * onboarding: the worst case is `{ status: "unresolved" }` and the business
 * continues with its OSM anchor.
 *  T1 paste → T2 Places API (Find Place, name + lat/lng bias, cross-checked by
 *    `nameSimilarity`) → T3 scrape (flagged, off by default) → T4 none.
 */
export async function resolveOsmToGmaps(input: ResolveInput): Promise<GmapsResolution> {
  const now = new Date().toISOString();

  // T1 — user supplied a Google id.
  if (isValidGmapsId(input.existingGmapsId)) {
    return { status: "verified", method: "paste", confidence: 1, resolved_at: now };
  }

  // T2 — Places API Find Place (server-side, key-gated).
  if (input.name && Number.isFinite(input.lat) && Number.isFinite(input.lng)) {
    try {
      const res = await fetch("/api/resolve-gmaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: input.name, lat: input.lat, lng: input.lng }),
      });
      if (res.ok) {
        const data = (await res.json()) as { place_id?: string; name?: string };
        if (isValidGmapsId(data.place_id)) {
          return {
            status: "resolved",
            method: "places_api",
            confidence: nameSimilarity(input.name ?? "", data.name ?? ""),
            resolved_at: now,
            verified_name: data.name ?? undefined,
          };
        }
      }
    } catch {
      // fall through to T3 / T4
    }
  }

  // T3 — flagged scrape path (best-effort, OFF by default per §5 decision #2).
  if (input.allowScrape) {
    return unresolvedResolution("scrape");
  }

  // T4 — no id recoverable; keep OSM anchor, honest empty state.
  return unresolvedResolution("none");
}
