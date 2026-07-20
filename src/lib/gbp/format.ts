/**
 * Pure formatting helpers shared across the dashboard.
 */

import { formatDistanceToNow, format, parseISO } from "date-fns";

/**
 * Strip Google Maps' aria-label suffix ", original" from a reviewer name.
 *
 * Example: "Budi Santoso, original" → "Budi Santoso"
 *          null                     → "Anonymous"
 */
export function cleanReviewerName(name: string | null | undefined): string {
  if (!name || !name.trim()) return "Anonymous";
  return name.replace(/,\s*original$/i, "").trim();
}

/**
 * Format an ISO 8601 timestamp as both relative ("3 hours ago") and absolute.
 * Returns "—" for null/undefined.
 */
export function formatTimestamp(iso: string | null | undefined): {
  relative: string;
  absolute: string;
} {
  if (!iso) return { relative: "—", absolute: "—" };
  try {
    const dt = parseISO(iso);
    return {
      relative: formatDistanceToNow(dt, { addSuffix: true }),
      absolute: format(dt, "yyyy-MM-dd HH:mm:ss xxx"),
    };
  } catch {
    return { relative: iso, absolute: iso };
  }
}

/** Truncate text to ~max chars, adding an ellipsis. */
export function truncate(text: string | null | undefined, max = 120): string {
  if (!text) return "";
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "…";
}

/** Compute average rating from a list of reviews; null if no rated reviews. */
export function averageRating(ratings: (number | null)[]): number | null {
  const valid = ratings.filter((r): r is number => typeof r === "number" && !Number.isNaN(r));
  if (valid.length === 0) return null;
  const sum = valid.reduce((acc, r) => acc + r, 0);
  return Math.round((sum / valid.length) * 100) / 100;
}

/** Format a numeric rating with one decimal place, e.g. 4 → "4.0". */
export function formatRating(rating: number | null | undefined): string {
  if (rating === null || rating === undefined || Number.isNaN(rating)) return "—";
  return rating.toFixed(1);
}

/** Tailwind class shorthand for the rating star color. */
export function ratingColor(rating: number | null | undefined): string {
  if (rating === null || rating === undefined) return "text-muted-foreground";
  if (rating >= 4.5) return "text-amber-500";
  if (rating >= 3.5) return "text-amber-600";
  if (rating >= 2.5) return "text-orange-500";
  return "text-destructive";
}
