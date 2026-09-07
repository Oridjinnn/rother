"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft } from "lucide-react";

import { FEATURES, getHub } from "@/lib/features";
import { useAppState } from "@/lib/app-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Consistent skeleton placeholder shown while a lazy feature module loads (used
 * as the Suspense fallback in section-view) and as a generic loading state.
 * Mirrors the card + chart + list shapes used across the dashboard so the
 * skeleton → content swap is visually stable.
 */
export function FeatureLoading({ className }: { className?: string }) {
  return (
    <div
      className={cn("mx-auto w-full max-w-7xl space-y-4", className)}
      aria-busy="true"
      aria-live="polite"
    >
      <Skeleton className="h-9 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/**
 * Subtle mount entrance for feature content. Kept ≤200ms and disabled when the
 * user prefers reduced motion.
 */
export function FeatureMotion({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Locks a feature to a single viewport: a fixed header (back + hub + title)
 * and an internal scroll region. The document body never scrolls — only the
 * inner <main> does, and only when a list genuinely exceeds one screen.
 */
export function FeaturePage({
  featureId,
  children,
}: {
  featureId: string;
  children: React.ReactNode;
}) {
  const { back } = useAppState();
  const def = FEATURES.find((f) => f.id === featureId);
  const hubDef = def ? getHub(def.hub) : null;
  const HubIcon = hubDef?.icon;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-border/60 px-4 py-3 sm:px-6">
        <Button variant="ghost" size="icon" onClick={back} aria-label="Back">
          <ArrowLeft />
        </Button>
        <div className="flex min-w-0 items-center gap-2">
          {HubIcon && <HubIcon className="size-5 shrink-0 text-primary" />}
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold leading-tight">
              {def?.label}
            </h1>
            {def?.description && (
              <p className="truncate text-xs text-muted-foreground">
                {def.description}
              </p>
            )}
          </div>
        </div>
      </header>
      <main className="gbp-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
        <FeatureMotion className="mx-auto w-full max-w-7xl">
          {children}
        </FeatureMotion>
      </main>
    </div>
  );
}
