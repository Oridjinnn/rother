"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Coffee, MapPin, Sparkles, Play, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";

interface HeaderProps {
  onRunNow: () => void;
  isRunning: boolean;
}

/**
 * Sticky app header: logo + project title + theme toggle + manual run button.
 * Collapses to a compact layout on mobile.
 */
export function Header({ onRunNow, isRunning }: HeaderProps) {
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
              GBP Monitor
            </h1>
            <p className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
              <MapPin className="size-3" aria-hidden="true" />
              Copenhagen Bali · competitor review watch
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            onClick={onRunNow}
            disabled={isRunning}
            className="bg-gradient-to-br from-primary to-emerald-700 text-primary-foreground shadow-sm hover:from-primary/90 hover:to-emerald-700/90 hover:shadow-md transition-all"
            size="sm"
            aria-label={isRunning ? "Running scraper…" : "Run scraper now (fixtures mode)"}
          >
            {isRunning ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                <span className="hidden sm:inline">Running…</span>
              </>
            ) : (
              <>
                <Play className="size-4" />
                <span className="hidden sm:inline">Run Now</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </motion.header>
  );
}
