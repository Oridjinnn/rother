import { NextResponse } from "next/server";

import { sanitizeError } from "@/lib/gbp/sanitize";
import { readAllSnapshots } from "@/lib/gbp/server-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/reviews-over-time
 *
 * Returns a chronological time series of review counts, for the "Reviews
 * count over time" area chart on the Overview tab.
 *
 * Groups all reviews across all snapshots by their `scraped_at` date
 * (truncated to the day). For each unique date, returns:
 *   - date: ISO date string (YYYY-MM-DD)
 *   - new_reviews: count of reviews first scraped on that date
 *   - cumulative: running total of all reviews up to and including that date
 *
 * The chart can render `new_reviews` as bars and `cumulative` as an area/line
 * to show both the per-run delta and the overall growth trend.
 *
 * Sorted oldest-first (left-to-right on a time axis).
 */
export async function GET() {
  try {
    const snapshots = await readAllSnapshots();

    // Gather all reviews with their scraped_at dates.
    // Truncate to the calendar day (YYYY-MM-DD) for grouping.
    const byDate = new Map<string, number>();
    for (const [, reviews] of snapshots.entries()) {
      for (const r of reviews) {
        const ts = r.scraped_at;
        if (!ts) continue;
        // Extract YYYY-MM-DD from the ISO timestamp
        const date = ts.slice(0, 10);
        byDate.set(date, (byDate.get(date) ?? 0) + 1);
      }
    }

    // Sort dates oldest-first and compute the cumulative total.
    const sortedDates = Array.from(byDate.keys()).sort();
    let cumulative = 0;
    const data = sortedDates.map((date) => {
      const newReviews = byDate.get(date) ?? 0;
      cumulative += newReviews;
      return {
        date,
        new_reviews: newReviews,
        cumulative,
      };
    });

    return NextResponse.json(
      { data, totalPoints: data.length, totalReviews: cumulative },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: "reviews-over-time query failed",
        detail: sanitizeError(err),
      },
      { status: 500 },
    );
  }
}
