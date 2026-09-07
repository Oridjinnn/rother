import type { NormalizedPlace } from "@/lib/gbp/types";

export type Place = NormalizedPlace;

export interface FetchPlacesOpts {
  lat?: number;
  lng?: number;
  limit?: number;
  signal?: AbortSignal;
  /** "business" biases toward POIs (default); "address" does a plain geocode. */
  mode?: "business" | "address";
}

export async function fetchPlaces(q: string, opts: FetchPlacesOpts = {}): Promise<Place[]> {
  if (q.trim().length < 2) return [];
  const u = new URL("/api/places", typeof window !== "undefined" ? window.location.origin : "http://localhost");
  u.searchParams.set("q", q.trim());
  if (typeof opts.lat === "number") u.searchParams.set("lat", String(opts.lat));
  if (typeof opts.lng === "number") u.searchParams.set("lng", String(opts.lng));
  if (opts.limit) u.searchParams.set("limit", String(opts.limit));
  if (opts.mode === "address") u.searchParams.set("mode", "address");
  const res = await fetch(u.toString(), { signal: opts.signal, headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const data = (await res.json()) as { places?: Place[] };
  return data.places ?? [];
}

/**
 * Server-side expansion of a Google Maps short link (maps.app.goo.gl etc.).
 * The browser cannot reach Google directly, so this goes through /api/places.
 */
export async function expandGmapsLink(link: string, signal?: AbortSignal): Promise<Place[]> {
  if (link.trim().length < 4) return [];
  const u = new URL("/api/places", typeof window !== "undefined" ? window.location.origin : "http://localhost");
  u.searchParams.set("path", "expand");
  u.searchParams.set("q", link.trim());
  const res = await fetch(u.toString(), { signal, headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const data = (await res.json()) as { places?: Place[] };
  return data.places ?? [];
}

/**
 * Reverse-lookup a coordinate pair into a normalized OSM place (server-side,
 * via /api/places in address mode). Used to anchor an address-only branch.
 */
export async function getPlaceFromCoords(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<Place | null> {
  const places = await fetchPlaces(`${lat},${lng}`, { lat, lng, limit: 1, mode: "address", signal });
  return places[0] ?? null;
}

const OSM_CATEGORY_MAP: Record<string, string> = {
  "amenity/restaurant": "restaurant",
  "amenity/cafe": "cafe",
  "amenity/fast_food": "meal_takeaway",
  "amenity/food_court": "meal_takeaway",
  "shop/coffee": "coffee_shop",
  "shop/bakery": "bakery",
  "amenity/bar": "bar",
  "amenity/pub": "pub",
  "tourism/hotel": "hotel",
  "tourism/guest_house": "guest_house",
  "tourism/resort": "resort",
  "amenity/spa": "spa",
  "tourism/spa": "spa",
  "shop/hairdresser": "hair_salon",
  "shop/beauty": "beauty_salon",
  "leisure/fitness_centre": "gym",
  "leisure/sports_centre": "gym",
  "sport/gym": "gym",
  "sport/yoga": "yoga_studio",
  "shop/clothes": "clothing_store",
  "shop/boutique": "boutique",
  "shop/supermarket": "supermarket",
  "shop/convenience": "convenience_store",
  "shop/books": "book_store",
  "shop/art": "art_gallery",
  "tourism/museum": "museum",
  "shop/travel_agency": "travel_agency",
  "office/estate_agent": "real_estate",
  "amenity/dentist": "dentist",
  "amenity/clinic": "doctor",
  "amenity/doctors": "doctor",
  "amenity/physiotherapist": "physiotherapist",
  "office/lawyer": "lawyer",
  "shop/accountancy": "accounting",
  "shop/car_repair": "car_repair",
  "amenity/fuel": "gas_station",
  "shop/electronics": "electronics_store",
  "shop/furniture": "furniture_store",
  "shop/houseware": "home_goods_store",
  "shop/kitchen": "home_goods_store",
  "shop/florist": "florist",
  "shop/jewelry": "jewelry_store",
  "shop/jewellery": "jewelry_store",
  "shop/pet": "pet_store",
  "amenity/veterinary": "veterinary_care",
  "amenity/nightclub": "night_club",
  "amenity/cinema": "movie_theater",
  "amenity/bowling_alley": "bowling_alley",
  "tourism/theme_park": "amusement_park",
  "tourism/attraction": "tourist_attraction",
  "tourism/camp_site": "campground",
  "tourism/caravan_site": "rv_park",
  "shop/car_rental": "car_rental",
  "amenity/taxi": "taxi_stand",
  "shop/car": "car_dealer",
  "shop/bicycle": "bicycle_store",
  "shop/shoe": "shoe_store",
  "shop/mall": "shopping_mall",
  "shop/department_store": "department_store",
  "amenity/pharmacy": "pharmacy",
  "shop/grocery": "grocery",
  "shop/liquor": "liquor_store",
  "leisure/stadium": "stadium",
  "amenity/university": "university",
  "amenity/school": "school",
  "amenity/library": "library",
  "amenity/bank": "bank",
  "amenity/atm": "atm",
  "office/insurance": "insurance_agency",
};

export function osmCategoryToAppCategory(category?: string): string | undefined {
  if (!category) return undefined;
  return OSM_CATEGORY_MAP[category.toLowerCase()];
}

export function manualPlace(q: string, lat?: number, lng?: number): Place {
  const slug = q
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "place";
  return {
    place_id: `manual/${slug}`,
    name: q || null,
    formatted_address: q,
    lat: lat ?? 0,
    lng: lng ?? 0,
    provider: "manual",
    unverified: true,
  };
}
