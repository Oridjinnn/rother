"use client";

import * as React from "react";

import { HUBS } from "@/lib/features";
import { useAppState } from "@/lib/app-state";
import { cn } from "@/lib/utils";
import { FEATURES } from "@/lib/features";

/**
 * The hub: four large, self-explanatory icons. Each opens a hub section whose
 * features are revealed on demand (via the grid or the Cmd+K navigator) rather
 * than dumped all at once.
 */
export function Hub() {
  const { business, openHub, setPaletteOpen } = useAppState();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-8">
        <p className="text-sm text-muted-foreground">
          {business ? business.name : "Your business"}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          What do you want to look at?
        </h1>
        <p className="mt-2 text-muted-foreground">
          Pick a category, or press{" "}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground"
          >
            ⌘K
          </button>{" "}
          to jump straight to a feature.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {HUBS.map((h) => {
          const Icon = h.icon;
          const count = FEATURES.filter((f) => f.hub === h.id).length;
          return (
            <button
              key={h.id}
              type="button"
              onClick={() => openHub(h.id)}
              className={cn(
                "group flex items-start gap-4 rounded-2xl border border-border bg-card p-6 text-left shadow-sm transition-all",
                "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
              )}
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                <Icon className="size-6" />
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-semibold">{h.label}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  {h.description}
                </span>
                <span className="mt-2 block text-xs text-muted-foreground/70">
                  {count} {count === 1 ? "feature" : "features"}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
