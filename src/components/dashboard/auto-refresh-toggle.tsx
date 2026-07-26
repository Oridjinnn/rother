"use client";

import * as React from "react";
import { Play, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface AutoRefreshToggleProps {
  /** Whether auto-refresh is currently active. */
  active: boolean;
  /** Toggle the active state. */
  onToggle: () => void;
  /** Seconds between refreshes. */
  intervalSeconds: number;
  /** Optional: show a manual refresh button too. */
  onManualRefresh?: () => void;
  className?: string;
}

/**
 * A compact auto-refresh toggle: a small play/pause pill button with a
 * tooltip showing the interval. Used on the Overview tab to let the user
 * enable live polling of the run summary + charts (default: off, so we
 * don't hammer the server when the user is just reading).
 *
 * When active, a subtle pulsing dot indicates the dashboard is "live".
 */
export function AutoRefreshToggle({
  active,
  onToggle,
  intervalSeconds,
  onManualRefresh,
  className,
}: AutoRefreshToggleProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("flex items-center gap-1.5", className)}>
        {onManualRefresh && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onManualRefresh}
                className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                aria-label="Refresh now"
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh now</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={active ? "default" : "outline"}
              size="sm"
              onClick={onToggle}
              className={cn(
                "h-8 gap-1.5 px-2.5 text-xs transition-all",
                active &&
                  "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary border-primary/30",
              )}
              aria-pressed={active}
              aria-label={
                active
                  ? `Auto-refresh active (every ${intervalSeconds}s)`
                  : "Enable auto-refresh"
              }
            >
              {active ? (
                <>
                  <span
                    className="relative flex size-2"
                    aria-hidden="true"
                  >
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-primary" />
                  </span>
                  <span className="hidden sm:inline">Live</span>
                </>
              ) : (
                <>
                  <Play className="size-3" aria-hidden="true" />
                  <span className="hidden sm:inline">Auto</span>
                </>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {active
              ? `Auto-refresh ON (every ${intervalSeconds}s) — click to pause`
              : `Enable auto-refresh (every ${intervalSeconds}s)`}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
