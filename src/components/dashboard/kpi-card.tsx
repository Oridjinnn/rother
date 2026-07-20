"use client";

import * as React from "react";
import { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  hint?: React.ReactNode;
  accent?: "primary" | "amber" | "terracotta" | "teal";
  className?: string;
}

const accentClasses: Record<NonNullable<KpiCardProps["accent"]>, string> = {
  primary: "from-primary/15 to-primary/5 text-primary",
  amber: "from-amber-500/15 to-amber-500/5 text-amber-600 dark:text-amber-400",
  terracotta:
    "from-orange-500/15 to-orange-500/5 text-orange-600 dark:text-orange-400",
  teal: "from-teal-500/15 to-teal-500/5 text-teal-600 dark:text-teal-400",
};

/**
 * KPI card: large number, label below, subtle icon, optional hint.
 * Used in the Overview tab's KPI row.
 */
export function KpiCard({
  label,
  value,
  icon: Icon,
  hint,
  accent = "primary",
  className,
}: KpiCardProps) {
  return (
    <Card className={cn("gbp-card-hover relative overflow-hidden py-0", className)}>
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <span className="text-3xl font-bold tracking-tight tabular-nums text-foreground">
            {value}
          </span>
          {hint && (
            <span className="text-xs text-muted-foreground leading-tight">{hint}</span>
          )}
        </div>
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br",
            accentClasses[accent],
          )}
          aria-hidden="true"
        >
          <Icon className="size-5" />
        </span>
      </CardContent>
    </Card>
  );
}
