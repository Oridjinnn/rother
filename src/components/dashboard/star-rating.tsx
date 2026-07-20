"use client";

import * as React from "react";
import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

interface StarRatingProps {
  rating: number | null | undefined;
  size?: "sm" | "md" | "lg";
  showValue?: boolean;
  className?: string;
}

/**
 * Render 5 lucide Star icons: filled for whole-star portions, outline for the rest.
 * Optionally show the numeric value alongside.
 */
export function StarRating({
  rating,
  size = "sm",
  showValue = true,
  className,
}: StarRatingProps) {
  const starClass = cn(
    size === "sm" && "size-3.5",
    size === "md" && "size-4",
    size === "lg" && "size-5",
  );

  if (rating === null || rating === undefined || Number.isNaN(rating)) {
    return (
      <span className={cn("inline-flex items-center gap-1 text-muted-foreground", className)}>
        <span className="inline-flex" aria-label="No rating">
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} className={cn(starClass, "opacity-40")} aria-hidden="true" />
          ))}
        </span>
        {showValue && <span className="text-xs">N/A</span>}
      </span>
    );
  }

  const rounded = Math.round(rating);
  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      aria-label={`Rated ${rating.toFixed(1)} out of 5`}
    >
      <span className="inline-flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={cn(
              starClass,
              i <= rounded
                ? "fill-amber-400 text-amber-500"
                : "fill-transparent text-muted-foreground/40",
            )}
            aria-hidden="true"
          />
        ))}
      </span>
      {showValue && (
        <span className="text-xs font-medium tabular-nums text-foreground/80">
          {rating.toFixed(1)}
        </span>
      )}
    </span>
  );
}
