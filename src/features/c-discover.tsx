"use client";

import * as React from "react";
import { Loader2, MapPin, Plus, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useApiQuery } from "@/lib/gbp/use-api-query";
import type { BranchConfig, CandidateCompetitor, CategoryScanResponse } from "@/lib/gbp/types";

/**
 * P1 / RISK-024 — category discovery.
 *
 * Runs a scraper-based category scan (reusing the Playwright pipeline) and
 * lists candidate competitors. Each candidate can be added to the active
 * business's monitored set (tenant-scoped via /api/business/branches).
 */
export default function DiscoverFeature() {
  const [category, setCategory] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [mode, setMode] = React.useState<"fixtures" | "cached" | "live">("fixtures");
  const [browserAvailable, setBrowserAvailable] = React.useState<boolean | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [scanError, setScanError] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState<string | null>(null);

  const { data: lastScan, refresh } = useApiQuery<CategoryScanResponse | { candidates: []; note?: string }>(
    "category-scan",
    "/api/category-scan",
  );

  // Surface browser availability so the live toggle can be gated.
  React.useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((j) => setBrowserAvailable(!!j.browserAvailable))
      .catch(() => setBrowserAvailable(false));
  }, []);

  async function runScan() {
    setScanning(true);
    setScanError(null);
    try {
      const res = await fetch("/api/category-scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category, location, mode }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || j.detail || "Scan failed");
      }
      await refresh();
    } catch (e) {
      setScanError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  }

  async function addCandidate(c: CandidateCompetitor) {
    if (!c.name) return;
    setAdding(c.name);
    try {
      const getRes = await fetch("/api/business/branches");
      const current = (await getRes.json()) as { branches: BranchConfig[] };
      const branches = Array.isArray(current.branches) ? current.branches : [];

      const slug = (s: string) =>
        s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";

      const competitorId = `disc-${slug(c.name)}`;
      // Reuse an existing "discovered" branch, else create one.
      let target = branches.find((b) => b.branch_id === "discovered");
      if (!target) {
        target = { branch_id: "discovered", branch_name: "Discovered competitors", competitors: [] };
        branches.push(target);
      }
      if (!target.competitors.some((x) => x.competitor_id === competitorId)) {
        target.competitors.push({
          competitor_id: competitorId,
          name: c.name,
          gmaps_url: c.gmaps_url,
          verified: false,
        });
      }

      const postRes = await fetch("/api/business/branches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ branches }),
      });
      if (!postRes.ok) throw new Error("Could not save competitor");
      await refresh();
    } catch (e) {
      setScanError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(null);
    }
  }

  const candidates =
    lastScan && "candidates" in lastScan ? (lastScan.candidates as CandidateCompetitor[]) : [];

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold">Discover competitors</h2>
        <p className="text-sm text-muted-foreground">
          Run a category scan to find competitors on Google Maps and add them to
          your monitored set.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New scan</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Category</span>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. coffee"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Location</span>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Copenhagen"
            />
          </label>
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Mode</span>
            <div className="flex items-center gap-1">
              {(["fixtures", "cached", "live"] as const).map((m) => {
                const disabled = m === "live" && browserAvailable === false;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => !disabled && setMode(m)}
                    disabled={disabled}
                    title={
                      m === "live" && browserAvailable === false
                        ? "Install Chromium to enable live scans"
                        : undefined
                    }
                    className={[
                      "rounded-md border px-2 py-1 text-xs capitalize transition-colors",
                      mode === m
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground",
                      disabled ? "cursor-not-allowed opacity-50" : "hover:border-primary",
                    ].join(" ")}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>
          <Button onClick={runScan} disabled={scanning || !category.trim()}>
            {scanning && <Loader2 className="mr-2 size-4 animate-spin" />}
            {scanning ? "Scanning…" : "Scan"}
          </Button>
        </CardContent>
      </Card>

      {scanError && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {scanError}
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {candidates.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No candidates yet. Run a scan above.
          </p>
        )}
        {candidates.map((c, i) => (
          <Card key={c.place_id ?? c.gmaps_url ?? i}>
            <CardContent className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-medium">{c.name ?? "Unknown"}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {typeof c.rating === "number" && (
                    <span className="inline-flex items-center gap-1">
                      <Star className="size-3" /> {c.rating}
                    </span>
                  )}
                  {typeof c.reviews_count === "number" && (
                    <span>{c.reviews_count.toLocaleString()} reviews</span>
                  )}
                  {c.place_id && <Badge variant="outline">verified place</Badge>}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!c.name || adding === c.name}
                onClick={() => addCandidate(c)}
              >
                {adding === c.name ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {candidates.length > 0 && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="size-3" /> Candidates are saved to your business&apos;s
           scoped config, not the shared seed listings.
        </p>
      )}
    </div>
  );
}
