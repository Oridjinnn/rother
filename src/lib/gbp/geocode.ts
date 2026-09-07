/**
 * P4 / geo-grid — best-effort coordinate extraction from a Google Maps URL.
 *
 * Google Maps place URLs frequently embed the location as `!3d<lat>!4d<lng>`
 * (or `!3m2!1d<lat>!2d<lng>`) in the path/query. When present we can plot a
 * competitor on the geo-grid without a separate geocoding API. Returns
 * `null` when no coordinates can be derived (the UI then marks the point as
 * geo-unknown and excludes it from the grid bounds).
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export function geocodeFromGmapsUrl(url: string | undefined): LatLng | null {
  if (!url) return null;
  // Pattern: !3d-8.690!4d115.170  (lat !3d, lng !4d)
  const m = url.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (m) {
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  // Fallback: @lat,lng,z in the path (e.g. /maps/place/X/@-8.69,115.17,15z)
  const at = url.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (at) {
    const lat = parseFloat(at[1]);
    const lng = parseFloat(at[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
}

/**
 * P4 / geo-grid — best-effort text geocoding via OpenStreetMap Nominatim
 * (free, no API key). Given a human-readable `name` and `location` we build a
 * single free-text query (`"name, location"`) and take the first result.
 *
 * Nominatim requires a descriptive User-Agent; we send `Rother/0.2 (+local)`.
 * Returns `null` on any failure (network error, empty result, non-finite
 * coordinates) so callers never throw.
 */
export async function geocodeFromText(
  name: string,
  location: string,
): Promise<LatLng | null> {
  const q = [name, location].filter((s) => s && s.trim().length > 0).join(", ");
  if (!q.trim()) return null;
  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
    encodeURIComponent(q);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Rother/0.2 (+local)" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!Array.isArray(json) || json.length === 0) return null;
    const lat = parseFloat(json[0].lat);
    const lng = parseFloat(json[0].lon);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    return null;
  } catch {
    return null;
  }
}
