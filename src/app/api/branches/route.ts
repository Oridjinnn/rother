import { NextResponse } from "next/server";

import type { BranchesResponse, BranchWithStats, CompetitorStats } from "@/lib/gbp/types";
import { readAllSnapshots, readLatestDelta, readAllDeltas, readListings } from "@/lib/gbp/server-data";

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
    const [listings, snapshots, allDeltas] = await Promise.all([
      readListings(),
      readAllSnapshots(),
      readAllDeltas(),
    ]);

    const deltasByComp = new Map<string, typeof allDeltas>();
    for (const d of allDeltas) {
      const arr = deltasByComp.get(d.competitor_id) ?? [];
      arr.push(d);
      deltasByComp.set(d.competitor_id, arr);
    }

    const branches: BranchWithStats[] = [];
    let totalCompetitors = 0;
    let totalReviews = 0;

    for (const branch of listings.branches) {
      const competitors: CompetitorStats[] = [];
      let branchTotal = 0;
      let branchNew = 0;
      let branchLastScrape: string | null = null;

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
        if (last_scraped_at && (!branchLastScrape || last_scraped_at > branchLastScrape)) {
          branchLastScrape = last_scraped_at;
        }
        const delta = await readLatestDelta(comp.competitor_id);

        branchTotal += reviews.length;
        branchNew += delta.length;
        totalReviews += reviews.length;

        const latestReview = reviews.length > 0
          ? reviews
              .filter((r) => r.text || r.relative_date)
              .sort(
                (a, b) => (b.scraped_at || "").localeCompare(a.scraped_at || ""),
              )[0] ?? null
          : null;

        const texts = reviews.map((r) => r.text).filter(Boolean) as string[];
        const avgLen =
          texts.length > 0
            ? Math.round(texts.reduce((s, t) => s + t.length, 0) / texts.length)
            : null;

        const compDeltas = (deltasByComp.get(comp.competitor_id) ?? [])
          .sort((a, b) => a.run_timestamp.localeCompare(b.run_timestamp));
        const trend =
          compDeltas.length >= 2
            ? compDeltas[compDeltas.length - 1].reviews.length > compDeltas[0].reviews.length
              ? "up"
              : compDeltas[compDeltas.length - 1].reviews.length < compDeltas[0].reviews.length
                ? "down"
                : "stable"
            : null;

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
          latest_review: latestReview
            ? { text: latestReview.text, relative_date: latestReview.relative_date, rating: latestReview.rating }
            : null,
          average_review_length: avgLen,
          trend_indicator: trend,
        });
      }

      const velocity =
        branchNew > 0 && branchLastScrape
          ? Math.round(branchNew / Math.max(1, Math.ceil(
              (Date.now() - new Date(branchLastScrape).getTime()) / (1000 * 60 * 60 * 24),
            )) * 100) / 100
          : null;

      branches.push({
        branch_id: branch.branch_id,
        branch_name: branch.branch_name,
        competitors,
        total_reviews: branchTotal,
        new_reviews_count: branchNew,
        review_velocity: velocity,
        last_scrape: branchLastScrape,
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
