import { NextResponse } from "next/server";

import { readAllSnapshots } from "@/lib/gbp/server-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/review-lengths
 *
 * Returns a distribution of review text lengths across all monitored
 * reviews, bucketed into 6 categories. Used by the "Review Text Length"
 * chart on the Overview tab.
 *
 * Buckets (by character count):
 *   - "Empty":    0 chars (no text — rating-only reviews)
 *   - "Short":    1–80 chars (a sentence or less)
 *   - "Medium":   81–200 chars (a paragraph)
 *   - "Long":     201–400 chars (detailed review)
 *   - "Very Long": 401+ chars (essay-length)
 *
 * Also returns the average + median character count for context.
 *
 * Response shape:
 *   {
 *     buckets: [{ label, range, count, color }],
 *     stats: { total, withText, average, median, min, max }
 *   }
 */
export async function GET() {
  try {
    const snapshots = await readAllSnapshots();

    const lengths: number[] = [];
    let emptyCount = 0;
    for (const [, reviews] of snapshots.entries()) {
      for (const r of reviews) {
        const text = r.text ?? "";
        if (text.length === 0) {
          emptyCount++;
        } else {
          lengths.push(text.length);
        }
      }
    }

    const buckets = [
      { label: "Empty", range: "0 chars", count: emptyCount, color: "oklch(0.65 0.10 200)" },
      {
        label: "Short",
        range: "1–80",
        count: lengths.filter((l) => l >= 1 && l <= 80).length,
        color: "oklch(0.70 0.15 75)",
      },
      {
        label: "Medium",
        range: "81–200",
        count: lengths.filter((l) => l >= 81 && l <= 200).length,
        color: "oklch(0.55 0.13 165)",
      },
      {
        label: "Long",
        range: "201–400",
        count: lengths.filter((l) => l >= 201 && l <= 400).length,
        color: "oklch(0.62 0.14 35)",
      },
      {
        label: "Very Long",
        range: "401+",
        count: lengths.filter((l) => l >= 401).length,
        color: "oklch(0.58 0.22 320)",
      },
    ];

    const total = lengths.length + emptyCount;
    const withText = lengths.length;
    const average =
      withText > 0
        ? Math.round(lengths.reduce((s, l) => s + l, 0) / withText)
        : 0;
    const sorted = [...lengths].sort((a, b) => a - b);
    const median =
      sorted.length > 0
        ? sorted.length % 2 === 0
          ? Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)
          : sorted[Math.floor(sorted.length / 2)]
        : 0;
    const min = sorted.length > 0 ? sorted[0] : 0;
    const max = sorted.length > 0 ? sorted[sorted.length - 1] : 0;

    return NextResponse.json(
      {
        buckets,
        stats: { total, withText, average, median, min, max },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: "review-lengths query failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
