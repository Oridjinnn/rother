"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowDownToLine,
  Info,
  Pause,
  Play,
  RefreshCw,
  ScrollText,
  TriangleAlert,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { LogsResponse } from "@/lib/gbp/types";

const LINE_OPTIONS = [50, 100, 200, 500, 1000] as const;
const POLL_INTERVAL_MS = 5000;

/** Parsed log line for color-coding. */
interface ParsedLine {
  raw: string;
  level: "INFO" | "WARNING" | "ERROR" | "OTHER";
  ts: string;
  logger: string;
  message: string;
  hasAlert: boolean;
}

/** Parse a log line like:
 *    "2026-07-20 08:35:48,785 INFO gbp-monitor.run_all Run summary: ..."
 * Returns level=OTHER if the format doesn't match. */
function parseLine(raw: string): ParsedLine {
  // Try the standard Python logging format first.
  // Format: "YYYY-MM-DD HH:MM:SS,mmm LEVEL logger message"
  const m = raw.match(
    /^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}[,.]?\d*)\s+(INFO|WARNING|ERROR|CRITICAL|DEBUG)\s+(\S+)\s+(.*)$/,
  );
  if (m) {
    const [, ts, levelRaw, logger, message] = m;
    const level =
      levelRaw === "INFO"
        ? "INFO"
        : levelRaw === "WARNING" || levelRaw === "CRITICAL"
          ? "WARNING"
          : levelRaw === "ERROR"
            ? "ERROR"
            : "INFO";
    return {
      raw,
      level,
      ts,
      logger,
      message,
      hasAlert: /\bALERT:/.test(message),
    };
  }
  // Fallback: look for a level keyword anywhere.
  if (/\bERROR\b/.test(raw)) {
    return { raw, level: "ERROR", ts: "", logger: "", message: raw, hasAlert: /\bALERT:/.test(raw) };
  }
  if (/\bWARN(ING)?\b/.test(raw)) {
    return { raw, level: "WARNING", ts: "", logger: "", message: raw, hasAlert: /\bALERT:/.test(raw) };
  }
  if (/\bINFO\b/.test(raw)) {
    return { raw, level: "INFO", ts: "", logger: "", message: raw, hasAlert: false };
  }
  return { raw, level: "OTHER", ts: "", logger: "", message: raw, hasAlert: false };
}

const LEVEL_STYLES: Record<ParsedLine["level"], string> = {
  INFO: "text-foreground/90",
  WARNING: "text-amber-700 dark:text-amber-300",
  ERROR: "text-destructive",
  OTHER: "text-muted-foreground",
};

const LEVEL_ICONS: Record<ParsedLine["level"], React.ReactNode> = {
  INFO: <Info className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />,
  WARNING: (
    <TriangleAlert className="size-3 shrink-0 text-amber-500" aria-hidden="true" />
  ),
  ERROR: (
    <AlertTriangle className="size-3 shrink-0 text-destructive" aria-hidden="true" />
  ),
  OTHER: <span className="size-3 shrink-0" aria-hidden="true" />,
};

export function LogsSection() {
  const [lines, setLines] = React.useState<string[]>([]);
  const [totalLines, setTotalLines] = React.useState(0);
  const [requestedLines, setRequestedLines] =
    React.useState<(typeof LINE_OPTIONS)[number]>(200);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = React.useState(true);
  const [lastFetch, setLastFetch] = React.useState<Date | null>(null);

  // Always-latest fetch function.
  const fetchLogs = React.useCallback(
    async (signal?: AbortSignal) => {
      try {
        const r = await fetch(`/api/logs?lines=${requestedLines}`, { signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = (await r.json()) as LogsResponse;
        setLines(json.lines);
        setTotalLines(json.totalLines);
        setError(null);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
        setLastFetch(new Date());
      }
    },
    [requestedLines],
  );

  // Initial fetch + re-fetch when requestedLines changes.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const controller = new AbortController();
    fetchLogs(controller.signal);
    return () => controller.abort();
  }, [fetchLogs]);

  // Polling.
  React.useEffect(() => {
    if (!autoRefresh) return;
    const controller = new AbortController();
    const id = setInterval(() => fetchLogs(controller.signal), POLL_INTERVAL_MS);
    return () => {
      clearInterval(id);
      controller.abort();
    };
  }, [autoRefresh, fetchLogs]);

  // Auto-scroll to bottom on new lines (only when autoRefresh is on).
  const scrollRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!autoRefresh || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines, autoRefresh]);

  const parsed = React.useMemo(() => lines.map(parseLine), [lines]);
  const errorCount = parsed.filter((p) => p.level === "ERROR").length;
  const warnCount = parsed.filter((p) => p.level === "WARNING").length;
  const alertCount = parsed.filter((p) => p.hasAlert).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="space-y-4"
    >
      <Card className="gbp-card-hover bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <ScrollText className="size-4 text-primary" aria-hidden="true" />
                Run Logs
                {autoRefresh ? (
                  <Badge
                    variant="outline"
                    className="gap-1 border-emerald-500/50 bg-emerald-500/10 px-1.5 py-0 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300"
                  >
                    <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                    LIVE
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="gap-1 px-1.5 py-0 text-[10px] font-semibold text-muted-foreground"
                  >
                    <Pause className="size-2.5" aria-hidden="true" />
                    Paused
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  Tailing{" "}
                  <code className="font-mono text-[11px]">data/run.log</code>
                </span>
                <span className="text-border">·</span>
                <span>
                  Showing{" "}
                  <span className="font-semibold tabular-nums text-foreground">
                    {lines.length}
                  </span>{" "}
                  of{" "}
                  <span className="font-semibold tabular-nums text-foreground">
                    {totalLines.toLocaleString()}
                  </span>{" "}
                  total lines
                </span>
                {lastFetch && (
                  <>
                    <span className="text-border">·</span>
                    <span className="font-mono text-[11px]">
                      updated {lastFetch.toLocaleTimeString()}
                    </span>
                  </>
                )}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={String(requestedLines)}
                onValueChange={(v) =>
                  setRequestedLines(
                    Number(v) as (typeof LINE_OPTIONS)[number],
                  )
                }
              >
                <SelectTrigger size="sm" className="h-8 w-[110px] text-xs">
                  <ArrowDownToLine className="size-3" aria-hidden="true" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LINE_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      Last {n} lines
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant={autoRefresh ? "secondary" : "outline"}
                size="sm"
                onClick={() => setAutoRefresh((v) => !v)}
                aria-pressed={autoRefresh}
                aria-label={autoRefresh ? "Pause auto-refresh" : "Resume auto-refresh"}
              >
                {autoRefresh ? (
                  <>
                    <Pause className="size-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="size-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">Resume</span>
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchLogs()}
                disabled={loading}
                aria-label="Refresh logs now"
              >
                <RefreshCw
                  className={cn("size-3.5", loading && "animate-spin")}
                  aria-hidden="true"
                />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Summary stats strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="gbp-card-hover py-0">
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ScrollText className="size-4" aria-hidden="true" />
            </span>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Lines shown
              </div>
              <div className="text-xl font-bold tabular-nums">
                {lines.length}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="gbp-card-hover py-0">
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex size-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Info className="size-4" aria-hidden="true" />
            </span>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                INFO
              </div>
              <div className="text-xl font-bold tabular-nums">
                {parsed.filter((p) => p.level === "INFO").length}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="gbp-card-hover py-0">
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex size-9 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300">
              <TriangleAlert className="size-4" aria-hidden="true" />
            </span>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Warnings
              </div>
              <div className="text-xl font-bold tabular-nums">
                {warnCount}
                {alertCount > 0 && (
                  <span className="ml-1 text-xs font-semibold text-destructive">
                    ({alertCount} ALERT)
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="gbp-card-hover py-0">
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex size-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <AlertTriangle className="size-4" aria-hidden="true" />
            </span>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Errors
              </div>
              <div className="text-xl font-bold tabular-nums">{errorCount}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Log viewer */}
      <Card className="gbp-card-hover">
        <CardContent className="p-0">
          <div
            ref={scrollRef}
            className="gbp-scrollbar max-h-[60vh] overflow-y-auto rounded-b-xl bg-zinc-950 p-3 font-mono text-xs leading-relaxed dark:bg-zinc-950/80"
            role="log"
            aria-live="polite"
            aria-label="Scraper run log"
          >
            {loading && lines.length === 0 ? (
              <div className="space-y-2 p-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    className="h-4 w-full bg-zinc-800"
                  />
                ))}
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                <AlertTriangle className="size-8 text-destructive" aria-hidden="true" />
                <div className="text-sm text-zinc-300">
                  Couldn’t load logs: {error}
                </div>
              </div>
            ) : parsed.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                <ScrollText
                  className="size-8 text-zinc-600"
                  aria-hidden="true"
                />
                <div className="text-sm text-zinc-400">
                  Log file is empty. Run the scraper to populate it.
                </div>
              </div>
            ) : (
              <ul className="space-y-0.5">
                {parsed.map((p, i) => (
                  <li
                    key={i}
                    className={cn(
                      "flex items-start gap-2 rounded px-1.5 py-0.5 hover:bg-zinc-800/50",
                      p.level === "ERROR" && "bg-destructive/10",
                      p.hasAlert && "border-l-2 border-l-destructive",
                    )}
                  >
                    <span className="mt-0.5 shrink-0">
                      {LEVEL_ICONS[p.level]}
                    </span>
                    <span className="min-w-0 flex-1 break-words">
                      {p.ts && (
                        <span className="text-zinc-500">{p.ts} </span>
                      )}
                      {p.logger && (
                        <span className="text-emerald-400/80">
                          {p.logger}{" "}
                        </span>
                      )}
                      <span className={LEVEL_STYLES[p.level]}>
                        {renderMessage(p.message)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/** Render a log message, bolding any `ALERT:` prefix. */
function renderMessage(message: string): React.ReactNode {
  const m = message.match(/^(ALERT:)(\s*.*)$/);
  if (m) {
    return (
      <>
        <span className="font-bold text-destructive">{m[1]}</span>
        <span>{m[2]}</span>
      </>
    );
  }
  return message;
}
