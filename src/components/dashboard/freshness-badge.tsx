"use client";

import * as React from "react";
import { Clock, AlertCircle } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface FreshnessBadgeProps {
  /** ISO timestamp of the last scrape, or null if never scraped. */
  lastScrapedAt: string | null;
  /** Size variant. */
  size?: "sm" | "md";
  className?: string;
}

type FreshnessLevel = "fresh" | "recent" | "stale" | "never";

function computeFreshness(lastScrapedAt: string | null): {
  level: FreshnessLevel;
  label: string;
  dotClass: string;
  textClass: string;
  bgClass: string;
  daysAgo: number | null;
} {
  if (!lastScrapedAt) {
    return {
      level: "never",
      label: "Never",
      dotClass: "bg-muted-foreground/50",
      textClass: "text-muted-foreground",
      bgClass: "bg-muted/30 border-border/40",
      daysAgo: null,
    };
  }
  const then = new Date(lastScrapedAt).getTime();
  if (Number.isNaN(then)) {
    return {
      level: "never",
      label: "Never",
      dotClass: "bg-muted-foreground/50",
      textClass: "text-muted-foreground",
      bgClass: "bg-muted/30 border-border/40",
      daysAgo: null,
    };
  }
  const now = Date.now();
  const daysAgo = (now - then) / (1000 * 60 * 60 * 24);
  if (daysAgo < 1) {
    return {
      level: "fresh",
      label: "Fresh",
      dotClass: "bg-emerald-500",
      textClass: "text-emerald-700 dark:text-emerald-400",
      bgClass: "bg-emerald-500/10 border-emerald-500/30",
      daysAgo,
    };
  }
  if (daysAgo < 3) {
    return {
      level: "recent",
      label: "Recent",
      dotClass: "bg-amber-500",
      textClass: "text-amber-700 dark:text-amber-400",
      bgClass: "bg-amber-500/10 border-amber-500/30",
      daysAgo,
    };
  }
  return {
    level: "stale",
    label: "Stale",
    dotClass: "bg-red-500",
    textClass: "text-red-700 dark:text-red-400",
    bgClass: "bg-red-500/10 border-red-500/30",
    daysAgo,
  };
}

function formatAgo(daysAgo: number | null): string {
  if (daysAgo === null) return "never scraped";
  if (daysAgo < 1) {
    const hours = Math.floor(daysAgo * 24);
    if (hours < 1) return "scraped just now";
    return `scraped ${hours}h ago`;
  }
  const d = Math.floor(daysAgo);
  return `scraped ${d}d ago`;
}

/**
 * A small badge showing how fresh the competitor's scraped data is:
 *   - Fresh (green): scraped within the last 24h
 *   - Recent (amber): scraped within the last 3 days
 *   - Stale (red): scraped more than 3 days ago
 *   - Never (muted): never scraped
 *
 * Uses a colored dot + label, with a tooltip showing the exact age.
 * The dot has a subtle ping animation when "fresh" so the user notices
 * recently-updated data.
 */
export function FreshnessBadge({
  lastScrapedAt,
  size = "sm",
  className,
}: FreshnessBadgeProps) {
  // Use a mounted flag to avoid hydration mismatch — computeFreshness()
  // calls Date.now() which differs between server and client.
  // During SSR + first paint, render a neutral placeholder; after mount,
  // compute the actual freshness.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const info = mounted ? computeFreshness(lastScrapedAt) : {
    level: "unknown" as const,
    label: "—",
    dotClass: "bg-muted-foreground/50",
    textClass: "text-muted-foreground",
    bgClass: "bg-muted/30 border-border/40",
    daysAgo: null,
  };
  const isFresh = info.level === "fresh";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
              info.bgClass,
              info.textClass,
              size === "sm" ? "h-4" : "h-5",
              className,
            )}
            role="status"
            aria-label={`Data freshness: ${info.label} (${formatAgo(info.daysAgo)})`}
          >
            <span className="relative flex size-1.5">
              {isFresh && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
              )}
              <span
                className={cn("relative inline-flex size-1.5 rounded-full", info.dotClass)}
                aria-hidden="true"
              />
            </span>
            {info.label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="font-semibold">Data freshness</p>
          <p className="text-xs opacity-90 capitalize">{info.label}</p>
          <p className="text-[10px] opacity-70">{formatAgo(info.daysAgo)}</p>
          {info.level === "stale" && (
            <p className="mt-0.5 flex items-center gap-1 text-[10px] text-red-600 dark:text-red-400">
              <AlertCircle className="size-2.5" aria-hidden="true" />
              Consider re-scraping this competitor
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
