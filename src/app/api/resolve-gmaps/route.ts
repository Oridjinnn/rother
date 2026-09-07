import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;
const PLACE_ID_RE = /^ChIJ[A-Za-z0-9_-]{20,}$/;
const FETCH_TIMEOUT_MS = 5000;

interface ResolveBody {
  name?: string;
  lat?: number;
  lng?: number;
}

/**
 * T2 of the OSM→Google resolver (Phase 2, F2). Maps an OSM place (name + lat/lng)
 * to a Google `ChIJ…` place_id via the sanctioned Places API Find Place endpoint.
 *
 * Key-gated: requires `GOOGLE_PLACES_API_KEY` server-side (never shipped to the
 * client). Without it the route returns 501 and the client transparently
 * degrades to T4 (unresolved). The returned id is re-validated server-side
 * against the collector's `^ChIJ…` regex before being trusted.
 */
export async function POST(request: Request) {
  if (!PLACES_KEY) {
    return NextResponse.json({ status: "unavailable", reason: "no_api_key" }, { status: 501 });
  }

  let body: ResolveBody;
  try {
    body = (await request.json()) as ResolveBody;
  } catch {
    return NextResponse.json({ status: "error", reason: "bad_json" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ status: "error", reason: "missing_input" }, { status: 400 });
  }

  const u = new URL("https://maps.googleapis.com/maps/api/place/findplacefromtext/json");
  u.searchParams.set("input", name);
  u.searchParams.set("inputtype", "textquery");
  u.searchParams.set("fields", "place_id,name");
  u.searchParams.set("locationbias", `circle:2000@${lat},${lng}`);
  u.searchParams.set("key", PLACES_KEY);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(u.toString(), {
      signal: ctrl.signal,
      headers: { "User-Agent": "Rother/0.3 (+local)" },
    });
    if (!res.ok) {
      return NextResponse.json({ status: "error", reason: "upstream" }, { status: 502 });
    }
    const data = (await res.json()) as {
      status?: string;
      candidates?: { place_id?: string; name?: string }[];
    };
    if (data.status !== "OK" || !data.candidates?.length) {
      return NextResponse.json({ status: "not_found", reason: data.status ?? "empty" }, { status: 404 });
    }
    const cand = data.candidates[0];
    if (!cand.place_id || !PLACE_ID_RE.test(cand.place_id)) {
      return NextResponse.json({ status: "not_found", reason: "invalid_id" }, { status: 404 });
    }
    return NextResponse.json({ status: "ok", place_id: cand.place_id, name: cand.name ?? null });
  } catch {
    return NextResponse.json({ status: "error", reason: "fetch_failed" }, { status: 502 });
  } finally {
    clearTimeout(t);
  }
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
