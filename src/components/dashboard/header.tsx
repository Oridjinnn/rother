"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Coffee, Download, Keyboard, MapPin, Sparkles, Play, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ThemeToggle } from "./theme-toggle";
import { LiveClock } from "./live-clock";
import type { AppMode, TextMap } from "@/lib/app-mode";

interface HeaderProps {
  onRunNow: () => void;
  isRunning: boolean;
  /** Optional: callback to open the keyboard shortcuts help dialog. */
  onShowShortcuts?: () => void;
  /** Optional: callback to open the data export dashboard dialog. */
  onShowExport?: () => void;
  /** Optional: ISO timestamp of the last scrape run (for the live clock). */
  lastRunAt?: string | null;
  /** App mode text map */
  T: TextMap;
  /** App mode */
  mode: AppMode;
}

/**
 * Sticky app header: logo + project title + theme toggle + manual run button.
 * Collapses to a compact layout on mobile.
 */
export function Header({ onRunNow, isRunning, onShowShortcuts, onShowExport, lastRunAt, T, mode }: HeaderProps) {
  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="sticky top-0 z-40 w-full border-b border-border/70 bg-background/85 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-emerald-700 text-primary-foreground shadow-md">
            <Coffee className="size-5" aria-hidden="true" />
            <Sparkles
              className="absolute -right-1 -top-1 size-3 text-amber-400"
              aria-hidden="true"
            />
          </span>
          <div className="min-w-0 leading-tight">
            <h1 className="truncate text-base font-bold tracking-tight text-foreground sm:text-lg">
              {T.name}
              <span className="ml-1.5 font-mono text-[10px] font-normal text-muted-foreground">
                v{T.version}
              </span>
            </h1>
            <p className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
              <MapPin className="size-3" aria-hidden="true" />
              {T.subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <LiveClock lastRunAt={lastRunAt} isRunning={isRunning} />
          {onShowExport && (
            <TooltipProvider delayDuration={400}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onShowExport}
                    className="size-9 text-muted-foreground hover:text-foreground"
                    aria-label="Export data"
                  >
                    <Download className="size-4" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="font-semibold">Export data</p>
                  <p className="text-xs opacity-90">Download CSV / JSON</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <ThemeToggle />
          {onShowShortcuts && (
            <TooltipProvider delayDuration={400}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onShowShortcuts}
                    className="size-9 text-muted-foreground hover:text-foreground"
                    aria-label="Show keyboard shortcuts"
                  >
                    <Keyboard className="size-4" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="font-semibold">Keyboard shortcuts</p>
                  <p className="text-xs opacity-90">Press ? to open</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <TooltipProvider delayDuration={400}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={onRunNow}
                  disabled={isRunning}
                  className="bg-gradient-to-br from-primary to-emerald-700 text-primary-foreground shadow-sm hover:from-primary/90 hover:to-emerald-700/90 hover:shadow-md transition-all"
                  size="sm"
                  aria-label={isRunning ? T.runButtonLoading : T.runButtonAria}
                >
                  {isRunning ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      <span className="hidden sm:inline">{T.runButtonLoading}</span>
                    </>
                  ) : (
                    <>
                      <Play className="size-4" />
                      <span className="hidden sm:inline">{T.runButton}</span>
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="font-semibold">
                  {isRunning ? T.runButtonLoading : T.runTooltipTitle}
                </p>
                {!isRunning && (
                  <p className="text-xs opacity-90">
                    Shortcut: press{" "}
                    <kbd className="rounded border border-border bg-muted px-1 py-0 font-mono text-[10px]">
                      g
                    </kbd>{" "}
                    then{" "}
                    <kbd className="rounded border border-border bg-muted px-1 py-0 font-mono text-[10px]">
                      r
                    </kbd>
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </motion.header>
  );
}
