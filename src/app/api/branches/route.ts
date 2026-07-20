import { NextResponse } from "next/server";

import type { BranchesResponse, BranchWithStats, CompetitorStats } from "@/lib/gbp/types";
import { readAllSnapshots, readLatestDelta, readListings } from "@/lib/gbp/server-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/branches
 *
 * Returns the branches × competitors tree from listings.json, enriched with
 * per-competitor stats: total_reviews, average_rating, last_scraped_at,
 * new_reviews_count (from the most-recent delta file).
 *
 * Shape: { branches: BranchWithStats[], totalCompetitors, totalReviews }
 */
export async function GET() {
  try {
    const [listings, snapshots] = await Promise.all([
      readListings(),
      readAllSnapshots(),
    ]);

    const branches: BranchWithStats[] = [];
    let totalCompetitors = 0;
    let totalReviews = 0;

    for (const branch of listings.branches) {
      const competitors: CompetitorStats[] = [];
      let branchTotal = 0;
      let branchNew = 0;

      for (const comp of branch.competitors) {
        totalCompetitors += 1;
        const reviews = snapshots.get(comp.competitor_id) ?? [];
        const validRatings = reviews
          .map((r) => r.rating)
          .filter((r): r is number => r !== null && !Number.isNaN(r));
        const average_rating =
          validRatings.length === 0
            ? null
            : Math.round(
                (validRatings.reduce((a, b) => a + b, 0) / validRatings.length) * 100,
              ) / 100;
        const scrapedDates = reviews
          .map((r) => r.scraped_at)
          .filter(Boolean)
          .sort();
        const last_scraped_at = scrapedDates.length > 0 ? scrapedDates[scrapedDates.length - 1] : null;
        const delta = await readLatestDelta(comp.competitor_id);

        branchTotal += reviews.length;
        branchNew += delta.length;
        totalReviews += reviews.length;

        competitors.push({
          competitor_id: comp.competitor_id,
          name: comp.name,
          branch_id: branch.branch_id,
          branch_name: branch.branch_name,
          gmaps_url: comp.gmaps_url,
          total_reviews: reviews.length,
          average_rating,
          last_scraped_at,
          new_reviews_count: delta.length,
        });
      }

      branches.push({
        branch_id: branch.branch_id,
        branch_name: branch.branch_name,
        competitors,
        total_reviews: branchTotal,
        new_reviews_count: branchNew,
      });
    }

    const body: BranchesResponse = {
      branches,
      totalCompetitors,
      totalReviews,
    };

    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "branches aggregation failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
