import { NextResponse } from "next/server";

import { sanitizeError } from "@/lib/gbp/sanitize";
import type {
  OverviewResponse,
  RatingDistribution,
} from "@/lib/gbp/types";
import {
  readAllSnapshots,
  readLatestDelta,
  readListings,
  readRunSummary,
  readSelectors,
} from "@/lib/gbp/server-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/overview
 *
 * Aggregates everything the dashboard's Overview tab needs in one request:
 *  - run_summary.json (latest run status)
 *  - selectors.json verification status (seed/browser_agent/manual_human)
 *  - total branches + competitors from listings.json
 *  - total reviews + rating distribution (1–5★) across ALL snapshots
 *  - new reviews from the most-recent delta files (per competitor + per branch)
 *  - errors list (from run_summary)
 *  - isAlert flag (failed > 0 && failed >= success) per the orchestrator's
 *    loud-warning logic
 *  - per-competitor stats for the "Reviews per Competitor" chart
 */
export async function GET() {
  try {
    const [runSummary, selectors, listings, snapshots] = await Promise.all([
      readRunSummary(),
      readSelectors(),
      readListings(),
      readAllSnapshots(),
    ]);

    const totalBranches = listings.branches.length;
    const totalCompetitors = listings.branches.reduce(
      (acc, b) => acc + b.competitors.length,
      0,
    );

    // Aggregate rating distribution + total review count.
    const ratingBuckets: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalReviews = 0;
    for (const reviews of snapshots.values()) {
      for (const r of reviews) {
        totalReviews += 1;
        if (r.rating !== null && r.rating >= 1 && r.rating <= 5) {
          const bucket = Math.round(r.rating);
          if (bucket >= 1 && bucket <= 5) ratingBuckets[bucket] += 1;
        }
      }
    }
    const ratingDistribution: RatingDistribution[] = [1, 2, 3, 4, 5].map((rating) => ({
      rating,
      count: ratingBuckets[rating],
    }));

    // Per-branch + per-competitor new reviews from most-recent delta files.
    const newReviewsPerBranch: OverviewResponse["newReviewsPerBranch"] = [];
    const competitorStats: OverviewResponse["competitorStats"] = [];
    let newReviewsLastRun = 0;

    for (const branch of listings.branches) {
      let branchCount = 0;
      for (const comp of branch.competitors) {
        const reviews = snapshots.get(comp.competitor_id) ?? [];
        const validRatings = reviews
          .map((r) => r.rating)
          .filter((r): r is number => r !== null && !Number.isNaN(r));
        const avg =
          validRatings.length === 0
            ? null
            : Math.round(
                (validRatings.reduce((a, b) => a + b, 0) / validRatings.length) * 100,
              ) / 100;
        const delta = await readLatestDelta(comp.competitor_id);
        branchCount += delta.length;
        const lastScrapedAt =
          reviews.length > 0
            ? reviews.reduce((latest, r) =>
                r.scraped_at > latest ? r.scraped_at : latest,
              "")
            : null;
        competitorStats.push({
          competitor_id: comp.competitor_id,
          name: comp.name,
          branch_name: branch.branch_name,
          total_reviews: reviews.length,
          average_rating: avg,
          new_reviews_count: delta.length,
          last_scraped_at: lastScrapedAt && lastScrapedAt !== "" ? lastScrapedAt : null,
        });
      }
      newReviewsLastRun += branchCount;
      newReviewsPerBranch.push({
        branch_id: branch.branch_id,
        branch_name: branch.branch_name,
        count: branchCount,
      });
    }

    const isUnproven = !selectors || selectors.verified_by === "seed";
    const isAlert =
      !!runSummary &&
      runSummary.failed > 0 &&
      runSummary.failed >= runSummary.success;

    const body: OverviewResponse = {
      runSummary,
      selectorVerification: {
        verified_by: selectors?._meta?.verified_by ?? selectors?.verified_by ?? "seed",
        last_verified: selectors?._meta?.last_verified ?? selectors?.last_verified ?? "—",
        isUnproven,
        note: selectors?._verification_note,
      },
      totalBranches,
      totalCompetitors,
      totalReviews,
      newReviewsLastRun,
      ratingDistribution,
      errors: runSummary?.errors ?? [],
      isAlert,
      newReviewsPerBranch,
      competitorStats,
    };

    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "overview aggregation failed",
        detail: sanitizeError(err),
      },
      { status: 500 },
    );
  }
}
