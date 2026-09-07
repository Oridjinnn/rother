"use client";

import { MapPin, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Place } from "@/lib/places";

function osmTileUrl(lat: number, lng: number, z = 16): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  const n = Math.pow(2, z);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  const sub = "abc"[(x + y) % 3];
  return `https://${sub}.tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

export function PlaceConfirmCard({
  place,
  onClear,
}: {
  place: Place;
  onClear: () => void;
}) {
  const thumb = osmTileUrl(place.lat, place.lng);
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-start gap-3">
        {thumb ? (
          <img
            src={thumb}
            alt="Map preview"
            width={80}
            height={80}
            className="size-20 shrink-0 rounded-md border border-border object-cover"
          />
        ) : (
          <div className="flex size-20 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
            <MapPin className="size-6" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{place.name ?? "Unnamed place"}</div>
          <div className="truncate text-sm text-muted-foreground">{place.formatted_address}</div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Badge variant="secondary">{place.provider}</Badge>
            {place.unverified && <Badge variant="outline">unverified</Badge>}
            {place.category && <Badge variant="outline">{place.category}</Badge>}
            {place.city && <Badge variant="outline">{place.city}</Badge>}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClear}
          aria-label="Clear selection"
        >
          <X className="size-4" />
        </Button>
      </div>
      <p className="mt-2 text-[10px] leading-tight text-muted-foreground">
        © OpenStreetMap contributors
      </p>
    </div>
  );
}
