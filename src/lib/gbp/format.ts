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

/**
 * Parse a relative date string (English or Indonesian) into an absolute ISO date,
 * using `scrapedAt` as the reference point.
 *
 * Supported formats:
 *   Indonesian: "X hari lalu", "X minggu lalu", "X bulan lalu", "X tahun lalu",
 *               "sehari lalu", "seminggu lalu", "sebulan lalu", "setahun lalu"
 *   English:    "X day(s) ago", "X week(s) ago", "X month(s) ago", "X year(s) ago",
 *               "a day ago", "a week ago", "a month ago", "a year ago",
 *               "an hour ago", "X hour(s) ago"
 *
 * Returns an ISO 8601 date string (YYYY-MM-DD) or null if unparseable.
 */
export function parseRelativeDate(
  relativeDate: string | null | undefined,
  scrapedAt: string,
): string | null {
  if (!relativeDate || !scrapedAt) return null;

  const ref = new Date(scrapedAt);
  if (Number.isNaN(ref.getTime())) return null;

  const text = relativeDate.trim().toLowerCase();

  const patterns: [RegExp, (n: number) => void][] = [
    [/(\d+)\s*hari\s+lalu/, (n) => ref.setDate(ref.getDate() - n)],
    [/sehari\s+lalu/, () => ref.setDate(ref.getDate() - 1)],
    [/(\d+)\s*minggu\s+lalu/, (n) => ref.setDate(ref.getDate() - n * 7)],
    [/seminggu\s+lalu/, () => ref.setDate(ref.getDate() - 7)],
    [/(\d+)\s*bulan\s+lalu/, (n) => ref.setMonth(ref.getMonth() - n)],
    [/sebulan\s+lalu/, () => ref.setMonth(ref.getMonth() - 1)],
    [/(\d+)\s*tahun\s+lalu/, (n) => ref.setFullYear(ref.getFullYear() - n)],
    [/setahun\s+lalu/, () => ref.setFullYear(ref.getFullYear() - 1)],
    [/an?\s*hour\s+ago/, () => ref.setHours(ref.getHours() - 1)],
    [/(\d+)\s*hours?\s+ago/, (n) => ref.setHours(ref.getHours() - n)],
    [/an?\s*day\s+ago/, () => ref.setDate(ref.getDate() - 1)],
    [/(\d+)\s*days?\s+ago/, (n) => ref.setDate(ref.getDate() - n)],
    [/an?\s*week\s+ago/, () => ref.setDate(ref.getDate() - 7)],
    [/(\d+)\s*weeks?\s+ago/, (n) => ref.setDate(ref.getDate() - n * 7)],
    [/an?\s*month\s+ago/, () => ref.setMonth(ref.getMonth() - 1)],
    [/(\d+)\s*months?\s+ago/, (n) => ref.setMonth(ref.getMonth() - n)],
    [/an?\s*year\s+ago/, () => ref.setFullYear(ref.getFullYear() - 1)],
    [/(\d+)\s*years?\s+ago/, (n) => ref.setFullYear(ref.getFullYear() - n)],
  ];

  for (const [re, apply] of patterns) {
    const m = text.match(re);
    if (m) {
      if (m[1] !== undefined) {
        apply(parseInt(m[1], 10));
      } else {
        apply(0);
      }
      return ref.toISOString().slice(0, 10);
    }
  }

  return null;
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
