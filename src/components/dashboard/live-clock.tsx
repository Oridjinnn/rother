"use client";

import * as React from "react";
import { Clock } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface LiveClockProps {
  /** ISO timestamp of the last scrape run's finish (or start) time. */
  lastRunAt?: string | null;
  /** Whether a scrape is currently running. */
  isRunning?: boolean;
  className?: string;
}

/**
 * A live clock that ticks every second, showing the current time + a
 * relative "X ago" indicator for the last scrape run.
 *
 * Hidden on mobile (the header is already crowded) — visible on sm+.
 * The clock uses a 1s interval (not requestAnimationFrame) because:
 *   - we only display HH:MM:SS (1s resolution is enough)
 *   - setInterval is cheaper than rAF for this use case
 *   - the component is unmounted when not visible (hidden on mobile),
 *     but we keep the interval running regardless so the "ago" text
 *     stays fresh when the user resizes to desktop.
 */
export function LiveClock({ lastRunAt, isRunning, className }: LiveClockProps) {
  // Initialize as null — the time is ONLY computed on the client (in the
  // useEffect below). This prevents hydration mismatches because the server
  // renders a static placeholder ("--:--:--") and the client replaces it
  // after mount. Date.now() / toLocaleTimeString() produce different values
  // on the server vs the client (different timezone, different request time).
  const [now, setNow] = React.useState<number | null>(null);

  React.useEffect(() => {
    // Set the initial time immediately on mount, then tick every second.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeStr = React.useMemo(() => {
    if (now === null) return "--:--:--"; // placeholder during SSR + first paint
    const d = new Date(now);
    return d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }, [now]);

  const agoStr = React.useMemo(() => {
    if (now === null || !lastRunAt) return null;
    const then = new Date(lastRunAt).getTime();
    if (Number.isNaN(then)) return null;
    const diffMs = now - then;
    if (diffMs < 0) return null;
    const sec = Math.floor(diffMs / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    return `${day}d ago`;
  }, [lastRunAt, now]);

  // Use a stable placeholder for aria-label during SSR to avoid mismatch.
  // Once mounted (now !== null), the real time is used.
  const ariaLabel = now === null
    ? "Current time"
    : `Current time: ${timeStr}${agoStr ? `, last scrape: ${agoStr}` : ""}`;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "hidden items-center gap-1.5 rounded-md border border-border/50 bg-muted/40 px-2 py-1 font-mono text-[11px] tabular-nums text-muted-foreground sm:inline-flex",
              isRunning && "border-primary/40 bg-primary/5 text-primary",
              className,
            )}
            role="timer"
            aria-label={ariaLabel}
          >
            <Clock
              className={cn("size-3", isRunning && "animate-spin-slow")}
              aria-hidden="true"
            />
            <span className="font-semibold text-foreground/80">{timeStr}</span>
            {agoStr && (
              <>
                <span className="text-border">·</span>
                <span className="text-muted-foreground">
                  {isRunning ? "running…" : agoStr}
                </span>
              </>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="font-semibold">
            {isRunning ? "Updating…" : "Current time (live)"}
          </p>
          <p className="text-xs opacity-90">
            {timeStr}
            {agoStr && !isRunning && ` · last update: ${agoStr}`}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
