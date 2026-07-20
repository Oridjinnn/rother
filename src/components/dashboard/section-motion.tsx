"use client";

import * as React from "react";
import { motion } from "framer-motion";

/**
 * Section wrapper with a subtle fade-in transition.
 * Used by each tab content section.
 */
export function SectionMotion({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

/** Skeleton row used as a loading placeholder for KPI cards. */
export function KpiSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-24 animate-pulse rounded-xl border border-border bg-muted/40"
        />
      ))}
    </div>
  );
}
