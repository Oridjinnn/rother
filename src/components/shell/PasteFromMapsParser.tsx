"use client";

import * as React from "react";
import { Link2, Loader2, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchPlaces, manualPlace, expandGmapsLink, type Place } from "@/lib/places";
import { geocodeFromGmapsUrl } from "@/lib/gbp/geocode";

const SHORT_LINK_RE = /maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]+\/maps/i;

function extractGmapsPlaceId(input: string): string | null {
  const pid = input.match(/place_id:([A-Za-z0-9_-]{20,})/);
  if (pid) return pid[1];
  const cid = input.match(/!1s(ChIJ[A-Za-z0-9_-]{20,})/);
  if (cid) return cid[1];
  const bare = input.match(/ChIJ[A-Za-z0-9_-]{20,}/);
  if (bare) return bare[0];
  return null;
}

function extractName(input: string): string | null {
  const m = input.match(/\/maps\/place\/([^/@]+)/);
  if (m) return decodeURIComponent(m[1].replace(/\+/g, " "));
  return null;
}

export interface ResolvedMaps {
  place: Place;
  gmapsPlaceId?: string;
}

async function resolveMapsInput(input: string): Promise<ResolvedMaps | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const coords = geocodeFromGmapsUrl(trimmed);
  const gmapsPlaceId = extractGmapsPlaceId(trimmed);
  const name = extractName(trimmed);

  // Short links (maps.app.goo.gl etc.) must expand server-side (browser can't
  // reach Google under CSP). expandGmapsLink returns an OSM-anchored place.
  if (SHORT_LINK_RE.test(trimmed)) {
    const places = await expandGmapsLink(trimmed);
    if (places.length > 0) {
      const place = places[0];
      const recovered =
        gmapsPlaceId ?? (place.place_id.startsWith("gmaps/") ? place.place_id.slice(6) : undefined);
      return { place, gmapsPlaceId: recovered };
    }
    if (gmapsPlaceId) {
      const place = manualPlace(name ?? trimmed, coords?.lat, coords?.lng);
      return { place, gmapsPlaceId };
    }
    return null;
  }

  if (!coords && !gmapsPlaceId) {
    const places = await fetchPlaces(trimmed, { limit: 1 });
    if (places.length) return { place: places[0] };
    return null;
  }

  if (name && coords) {
    const places = await fetchPlaces(name, { lat: coords.lat, lng: coords.lng, limit: 5 });
    const near = places.find(
      (p) => Math.abs(p.lat - coords.lat) < 0.01 && Math.abs(p.lng - coords.lng) < 0.01,
    );
    if (near) return { place: near, gmapsPlaceId: gmapsPlaceId ?? undefined };
  }

  const place = manualPlace(name ?? trimmed, coords?.lat, coords?.lng);
  return { place, gmapsPlaceId: gmapsPlaceId ?? undefined };
}

export function PasteFromMapsParser({
  onResolved,
}: {
  onResolved: (r: ResolvedMaps) => void;
}) {
  const [value, setValue] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const run = React.useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const resolved = await resolveMapsInput(value);
      if (!resolved) {
        setError("Could not read that link or address. Try the search box above.");
        return;
      }
      onResolved(resolved);
      setValue("");
    } finally {
      setLoading(false);
    }
  }, [value, onResolved]);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void run();
              }
            }}
            placeholder="Paste a Google Maps link or address…"
            aria-label="Paste Google Maps link"
            className="pl-9"
          />
        </div>
        <Button type="button" onClick={() => void run()} disabled={!value.trim() || loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
          Resolve
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
