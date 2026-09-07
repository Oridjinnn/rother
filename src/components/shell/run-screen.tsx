"use client";

import * as React from "react";
import { Loader2, Play, Radar } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAppState } from "@/lib/app-state";

/**
 * The Run gate. Shown after onboarding and BEFORE the hubs are revealed.
 *
 * Honors the no-page-scroll contract: a single, centered, one-viewport screen.
 * Pressing Run triggers a LIVE scrape of THE USER'S OWN business via
 * POST /api/scrape/trigger, shows a scanning state, and — regardless of success
 * or failure — reveals the hubs (which then show the user's data or empty
 * states). A scrape failure must NEVER block navigation.
 */
export function RunScreen() {
  const { business, startRun } = useAppState();
  const [scanning, setScanning] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);

  const businessName = business?.name ?? "your business";

  const handleRun = React.useCallback(async () => {
    if (!business || scanning) return;
    setScanning(true);
    setStatus("Starting live scrape…");
    try {
      const res = await fetch("/api/scrape/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: business.name,
          location: business.location,
          category: business.category,
          categoryId: business.categoryId,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setStatus(
          data?.error
            ? `Scrape could not start: ${data.error}`
            : "Scrape could not start — showing empty states.",
        );
      } else {
        setStatus("Scanning complete — opening your dashboard…");
      }
    } catch {
      setStatus("Network error reaching the scraper — showing empty states.");
    } finally {
      // Reveal the hubs whether the scrape succeeded or failed. Features will
      // show the user's scraped data if any, or explicit empty states.
      startRun();
    }
  }, [business, scanning, startRun]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 text-center">
      <div className="w-full max-w-md">
        <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Radar className="size-7" aria-hidden="true" />
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">
          Start monitoring {businessName}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We&apos;ll run a live scan of <span className="font-medium">{businessName}</span>
          {business?.location ? ` in ${business.location}` : ""} and its competitors,
          then open your dashboard.
        </p>

        <Button
          size="lg"
          className="mt-7 w-full"
          onClick={handleRun}
          disabled={scanning}
        >
          {scanning ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Scanning…
            </>
          ) : (
            <>
              <Play className="size-4" />
              Run
            </>
          )}
        </Button>

        {scanning && status && (
          <p className="mt-4 text-xs text-muted-foreground">{status}</p>
        )}
      </div>
    </div>
  );
}
