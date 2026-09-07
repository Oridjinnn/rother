"use client";

import * as React from "react";
import { Loader2, RefreshCw, Store } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAppState } from "@/lib/app-state";
import { getCategory } from "@/lib/categories";

/**
 * Tools › Config. Repurposed for the per-user model: it shows ONLY the user's
 * own selected business (never the seeded Copenhagen Bali demo) and offers a
 * "Run scan again" affordance. There is intentionally NO option to switch to
 * the demo business.
 */
export default function ConfigFeature() {
  const { business, startRun } = useAppState();
  const [scanning, setScanning] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);

  const category = getCategory(business?.categoryId);

  const runAgain = React.useCallback(async () => {
    if (!business || scanning) return;
    setScanning(true);
    setStatus("Re-running live scrape…");
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
      setStatus(res.ok ? "Scan queued — refreshing your data." : "Could not start scan.");
    } catch {
      setStatus("Network error — try again.");
    } finally {
      setScanning(false);
      startRun();
    }
  }, [business, scanning, startRun]);

  if (!business) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
        No business selected yet.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-primary">
          <Store className="size-4" />
          Your business
        </div>

        <dl className="space-y-3 text-sm">
          <Row label="Name" value={business.name} />
          <Row label="Location" value={business.location || "—"} />
          <Row label="Category" value={category?.label ?? business.category ?? "—"} />
        </dl>

        <Button
          className="mt-6 w-full"
          onClick={runAgain}
          disabled={scanning}
          variant="outline"
        >
          {scanning ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Scanning…
            </>
          ) : (
            <>
              <RefreshCw className="size-4" />
              Run scan again
            </>
          )}
        </Button>
        {status && (
          <p className="mt-3 text-center text-xs text-muted-foreground">{status}</p>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-2 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-right">{value}</dd>
    </div>
  );
}
