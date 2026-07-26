"use client";

import * as React from "react";
import Link from "next/link";
import { Coffee, Github, ShieldCheck, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HealthSparkline } from "./health-sparkline";
import type { VerifiedBy } from "@/lib/gbp/types";
import type { AppMode, TextMap } from "@/lib/app-mode";

interface FooterProps {
  verifiedBy: VerifiedBy | null;
  lastVerified: string | null;
  /** Health indicator props — when provided, a colored dot is shown. */
  health?: {
    success: number;
    failed: number;
    skipped: number;
    /** ISO timestamp of the last run's finish time (or start if no finish). */
    lastRunAt?: string | null;
  } | null;
  /** App mode text map */
  T: TextMap;
  /** App mode */
  mode: AppMode;
}

const verificationMeta: Record<
  VerifiedBy,
  { label: string; className: string; icon: typeof ShieldCheck }
> = {
  seed: {
    label: "Selectors UNPROVEN (seed)",
    className:
      "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    icon: ShieldAlert,
  },
  browser_agent: {
    label: "Selectors: browser_agent",
    className:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    icon: ShieldCheck,
  },
  manual_human: {
    label: "Selectors: manual_human",
    className:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    icon: ShieldCheck,
  },
};

type HealthLevel = "healthy" | "warning" | "critical" | "unknown";

function computeHealth(h: FooterProps["health"]): {
  level: HealthLevel;
  label: string;
  dotClass: string;
  textClass: string;
} {
  if (!h) {
    return {
      level: "unknown",
      label: "No runs yet",
      dotClass: "bg-muted-foreground/40",
      textClass: "text-muted-foreground",
    };
  }
  const { success, failed } = h;
  if (failed === 0) {
    return {
      level: "healthy",
      label: `Healthy · ${success} ok`,
      dotClass: "bg-emerald-500",
      textClass: "text-emerald-700 dark:text-emerald-400",
    };
  }
  if (failed >= success && success >= 0) {
    return {
      level: "critical",
      label: `Critical · ${failed} failed ≥ ${success} ok`,
      dotClass: "bg-destructive",
      textClass: "text-destructive",
    };
  }
  return {
    level: "warning",
    label: `Warning · ${failed} failed`,
    dotClass: "bg-amber-500",
    textClass: "text-amber-700 dark:text-amber-400",
  };
}

/** Sticky footer per UI/UX rule. Pushed to bottom by min-h-screen flex flex-col. */
export function Footer({ verifiedBy, lastVerified, health, T, mode }: FooterProps) {
  const meta = verifiedBy ? verificationMeta[verifiedBy] : null;
  const VIcon = meta?.icon ?? ShieldAlert;
  const healthInfo = computeHealth(health);
  const total = health
    ? health.success + health.failed + health.skipped
    : 0;

  return (
    <footer className="mt-auto border-t border-border/70 bg-muted/30">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 text-xs text-muted-foreground sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
            <Coffee className="size-3.5 text-primary" aria-hidden="true" />
            {T.name}
          </span>
          <span className="hidden text-border lg:inline">·</span>
          <span className="font-mono text-[11px] text-muted-foreground">v{T.version}</span>
          <span className="hidden text-border lg:inline">·</span>
          <span className="italic">{T.tagline}</span>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {/* Health trend sparkline — tiny bar chart of recent run health */}
          <HealthSparkline />

          {/* Health check indicator — colored dot + label */}
          {health && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={
                      "inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-[11px] font-medium " +
                      healthInfo.textClass
                    }
                    role="status"
                    aria-label={`System health: ${healthInfo.label}`}
                  >
                    <span className="relative flex size-2">
                      {healthInfo.level === "healthy" && (
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                      )}
                      <span
                        className={"relative inline-flex size-2 rounded-full " + healthInfo.dotClass}
                        aria-hidden="true"
                      />
                    </span>
                    {healthInfo.label}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="font-semibold">{T.healthPanelTitle}</p>
                  <p className="text-xs opacity-90">
                    {total} source{total === 1 ? "" : "s"} ·{" "}
                    {health.success} success · {health.failed} failed ·{" "}
                    {health.skipped} skipped
                  </p>
                  {health.skipped > 0 && (
                    <p className="text-[10px] opacity-70">
                      Skipped sources have no fixture data (fixtures mode) or were
                      unreachable (live mode). Not an error.
                    </p>
                  )}
                  {health.lastRunAt && (
                    <p className="text-[10px] opacity-70">
                      {new Date(health.lastRunAt).toLocaleString()}
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Selectors verification badge — only in dev mode */}
          {meta && T.showTechnicalDetails && (
            <Badge
              variant="outline"
              className={`gap-1 px-2 py-0.5 text-[11px] font-medium ${meta.className}`}
              title={
                lastVerified ? `Last verified: ${lastVerified}` : "Last verified: —"
              }
            >
              <VIcon className="size-3" aria-hidden="true" />
              {meta.label}
              {lastVerified && lastVerified !== "—" && (
                <span className="ml-1 opacity-70">· {lastVerified}</span>
              )}
            </Badge>
          )}

          {/* GitHub Actions cron link — only in dev mode */}
          {T.showCronLink && (
            <Link
              href="https://github.com/features/actions"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <Github className="size-3.5" aria-hidden="true" />
              GitHub Actions cron · daily 05:00 WITA
            </Link>
          )}

          {/* Mode switcher — subtle link to toggle between Client and Dev */}
          <button
            type="button"
            onClick={() => {
              const newMode = mode === "dev" ? "client" : "dev";
              const url = new URL(window.location.href);
              if (newMode === "dev") {
                url.searchParams.set("mode", "dev");
              } else {
                url.searchParams.delete("mode");
              }
              window.location.href = url.toString();
            }}
            className="inline-flex items-center gap-1 rounded-md border border-border/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={mode === "dev" ? "Switch to client view" : "Switch to developer view"}
            title={mode === "dev" ? "Switch to client view" : "Switch to developer view"}
          >
            {mode === "dev" ? "Client view" : "Dev view"}
          </button>
        </div>
      </div>
    </footer>
  );
}
