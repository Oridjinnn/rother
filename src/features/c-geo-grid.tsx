"use client";

import * as React from "react";
import "leaflet/dist/leaflet.css";
import type {
  Map as LeafletMap,
  CircleMarker as LCircleMarker,
  Rectangle as LRectangle,
} from "leaflet";
import { MapPin } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/lib/gbp/use-api-query";
import type { GeoGridResponse, GeoPoint } from "@/lib/gbp/types";

const KIND_COLOR: Record<GeoPoint["kind"], string> = {
  business: "#16a34a",
  branch: "#2563eb",
  competitor: "#dc2626",
};

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * P4 / geo-grid — plot the active business's HQ, branches and competitors on a
 * real Leaflet + OpenStreetMap map (no API key) with a uniform competitive
 * "grid" overlay drawn on top. Coordinates come from config or a Google Maps
 * URL; points with no resolvable coordinates are listed separately.
 */
export default function GeoGridFeature() {
  const { data, loading, error } = useApiQuery<GeoGridResponse>(
    "geo-grid",
    "/api/geo-grid",
    { static: true },
  );

  if (loading) {
    return <Skeleton className="h-[440px] w-full rounded-lg" />;
  }
  if (error || !data) {
    return (
      <div className="p-6 text-sm text-destructive">
        {error || "No geo data available."}
      </div>
    );
  }

  const bounds = data.bounds;
  const unknown = data.points.filter((p) => p.source === "unknown");

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold">Geo grid</h2>
        <p className="text-sm text-muted-foreground">
          Competitive grid across your branches and monitored competitors.
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          {bounds ? (
            <div className="overflow-hidden rounded-lg border border-border">
              <GeoLeaflet data={data} />
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No resolvable coordinates yet. Add lat/lng to your business,
              branches or competitors, or use Google Maps URLs that embed
              location.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {(["business", "branch", "competitor"] as const).map((k) => (
          <Badge key={k} variant="outline" className="gap-1">
            <span
              className="size-2 rounded-full"
              style={{ background: KIND_COLOR[k] }}
            />
            {k}
          </Badge>
        ))}
      </div>

      {unknown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Missing coordinates</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm text-muted-foreground">
            {unknown.map((p) => (
              <span key={p.id} className="flex items-center gap-2">
                <MapPin className="size-3" /> {p.label}
              </span>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Client-only Leaflet map. Leaflet touches `window`/`document`, so it is
 * imported dynamically inside `useEffect` (never at module top-level) and the
 * map is torn down on unmount. Rendered only when `bounds` exists.
 */
function GeoLeaflet({ data }: { data: GeoGridResponse }) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<LeafletMap | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;
    let cancelled = false;

    import("leaflet").then((mod) => {
      if (cancelled || !containerRef.current) return;
      const L = mod.default;

      const map = L.map(containerRef.current, {
        attributionControl: true,
      }).setView([0, 0], 2);
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: OSM_ATTRIBUTION,
        maxZoom: 19,
      }).addTo(map);

      const maxCell = Math.max(1, ...data.grid.cells.map((c) => c.pointCount));

      for (const p of data.points.filter((pt) => pt.source !== "unknown")) {
        const color = KIND_COLOR[p.kind] ?? "#64748b";
        const marker: LCircleMarker = L.circleMarker([p.lat, p.lng], {
          radius: p.kind === "competitor" ? 6 : 8,
          color: "#ffffff",
          weight: 2,
          fillColor: color,
          fillOpacity: 0.9,
        }).addTo(map);
        marker.bindTooltip(p.label, { direction: "top", offset: [0, -4] });
      }

      for (const cell of data.grid.cells.filter((c) => c.pointCount > 0)) {
        const intensity = cell.pointCount / maxCell;
        const rect: LRectangle = L.rectangle(
          [
            [cell.minLat, cell.minLng],
            [cell.maxLat, cell.maxLng],
          ],
          {
            color: "#2563eb",
            weight: 1,
            fillColor: "#2563eb",
            fillOpacity: 0.06 + intensity * 0.28,
          },
        ).addTo(map);
        rect.bindTooltip(`${cell.pointCount} point(s)`, {
          direction: "top",
          sticky: true,
        });
      }

      const b = data.bounds;
      if (b) {
        map.fitBounds(
          [
            [b.minLat, b.minLng],
            [b.maxLat, b.maxLng],
          ],
          { padding: [24, 24] },
        );
      }
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [data]);

  return <div ref={containerRef} className="h-[440px] w-full" />;
}
