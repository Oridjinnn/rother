"use client";

import * as React from "react";
import { CalendarClock, Clock, Timer } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Scrape Schedule — a static info card showing the GitHub Actions cron
 * schedule (daily 05:00 WITA = 22:00 UTC previous day) + a live countdown
 * to the next scheduled run.
 *
 * No API needed — the schedule is a known constant from the GitHub Actions
 * workflow (`cron: '0 22 * * *'`). The countdown is computed client-side
 * from the current time.
 *
 * Per EXECUTION_RULES.md Rule 4: zero-cost, no AI/LLM — this is pure
 * date arithmetic + display.
 */
export function ScrapeSchedule() {
  // Initialize as null — only set on the client to prevent hydration mismatch
  // (server time + timezone differ from client).
  const [now, setNow] = React.useState<number | null>(null);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Compute the next scheduled run: 22:00 UTC = 06:00 WITA (UTC+8) the next day.
  // The cron is `0 22 * * *`, so the next run is the next 22:00 UTC.
  const { nextRunUtc, nextRunWita, countdown } = React.useMemo(() => {
    if (now === null) {
      // Placeholder during SSR — return a safe default that won't mismatch
      const placeholder = new Date(0); // epoch
      return {
        nextRunUtc: placeholder,
        nextRunWita: placeholder,
        countdown: "—",
      };
    }
    const d = new Date(now);
    const next = new Date(d);
    next.setUTCHours(22, 0, 0, 0);
    // If it's already past 22:00 UTC today, the next run is tomorrow
    if (d.getUTCHours() >= 22) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    // WITA is UTC+8, so 22:00 UTC = 06:00 WITA the NEXT day.
    // Wait — the cron is `0 22 * * *` which the plan says is "05:00 WITA daily".
    // 22:00 UTC = 22+8 = 30:00 = 06:00 WITA next day. Hmm, the plan says 05:00.
    // Let me re-check: the workflow comment says "05:00 WITA daily = 22:00 UTC
    // previous day". So 05:00 WITA = 05-8 = -3 = 21:00 UTC previous day? No.
    // WITA = UTC+8, so 05:00 WITA = 05:00 - 8:00 = 21:00 UTC the day before.
    // But the cron is `0 22 * * *` = 22:00 UTC = 06:00 WITA. There's a 1h
    // discrepancy in the plan. We'll use the cron value (22:00 UTC = 06:00 WITA)
    // since that's what actually runs.
    const witaDate = new Date(next.getTime() + 8 * 60 * 60 * 1000);
    const diffMs = next.getTime() - now;
    // Format countdown as "Xd Yh Zm Ws"
    const totalSec = Math.max(0, Math.floor(diffMs / 1000));
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    let countdown: string;
    if (days > 0) {
      countdown = `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      countdown = `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      countdown = `${minutes}m ${seconds}s`;
    } else {
      countdown = `${seconds}s`;
    }

    return {
      nextRunUtc: next,
      nextRunWita: witaDate,
      countdown,
    };
  }, [now]);

  const witaTimeStr = nextRunWita.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  });
  const witaDateStr = nextRunWita.toLocaleDateString("en-GB", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const utcTimeStr = nextRunUtc.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  });

  return (
    <Card className="gbp-card-hover">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-4 text-primary" aria-hidden="true" />
          Scrape Schedule
          <Badge
            variant="outline"
            className="ml-1 gap-1 px-1.5 py-0 text-[10px] font-medium text-emerald-700 dark:text-emerald-300 border-emerald-500/40 bg-emerald-500/10"
          >
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
            </span>
            Scheduled
          </Badge>
        </CardTitle>
        <CardDescription>
          GitHub Actions cron — runs automatically every day.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Next run countdown — the headline */}
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-center">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Next scheduled run in
          </div>
          <div className="mt-0.5 font-mono text-2xl font-bold tabular-nums text-primary">
            {countdown}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {witaDateStr} · {witaTimeStr} WITA
          </div>
        </div>

        {/* Schedule details */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border border-border/40 bg-muted/20 p-2">
            <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <Clock className="size-2.5" aria-hidden="true" />
              Cron
            </div>
            <div className="mt-0.5 font-mono text-sm font-semibold text-foreground">
              0 22 * * *
            </div>
            <div className="text-[9px] text-muted-foreground">daily · UTC</div>
          </div>
          <div className="rounded-md border border-border/40 bg-muted/20 p-2">
            <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <Timer className="size-2.5" aria-hidden="true" />
              Local (WITA)
            </div>
            <div className="mt-0.5 font-mono text-sm font-semibold text-foreground">
              06:00 daily
            </div>
            <div className="text-[9px] text-muted-foreground">UTC+8</div>
          </div>
        </div>

        {/* Next run UTC time */}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Next run (UTC):</span>
          <span className="font-mono">
            {nextRunUtc.toLocaleDateString("en-GB", {
              weekday: "short",
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            })}{" "}
            {utcTimeStr}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
