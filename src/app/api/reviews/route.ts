import { NextResponse } from "next/server";

import type { Review, ReviewsResponse } from "@/lib/gbp/types";
import { readAllSnapshots, readListings } from "@/lib/gbp/server-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/reviews?branch_id=&competitor_id=&rating=&q=&page=1&pageSize=25
 *
 * Paginated, filtered view of ALL reviews across all competitor snapshots.
 * - branch_id: optional, filters by branch
 * - competitor_id: optional, filters by competitor (must belong to branch_id
 *     if both are supplied — but we don't enforce that here, we just filter)
 * - rating: optional, comma-separated list of star ratings to include
 *     (e.g. "1,3,5"). Reviews with null rating are excluded when this filter
 *     is set.
 * - q: optional, case-insensitive substring match on reviewer_name + text
 * - page: 1-indexed, default 1
 * - pageSize: default 25, capped at 100
 *
 * Returns { data: Review[], total, page, pageSize }.
 *
 * We hydrate each review with its branch_name + competitor_name client-side
 * via the listings map (kept in localStorage or fetched from /api/branches).
 * To keep this endpoint simple, the response only includes the raw review
 * shape — clients join with /api/branches output for display names.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branch_id") || undefined;
    const competitorId = searchParams.get("competitor_id") || undefined;
    const ratingParam = searchParams.get("rating") || undefined;
    const q = (searchParams.get("q") || "").trim().toLowerCase() || undefined;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const pageSizeRaw = parseInt(searchParams.get("pageSize") || "25", 10) || 25;
    const pageSize = Math.min(100, Math.max(1, pageSizeRaw));

    const ratingFilter = ratingParam
      ? new Set(
          ratingParam
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .map((s) => Math.round(Number(s)))
            .filter((n) => !Number.isNaN(n) && n >= 1 && n <= 5),
        )
      : null;

    const [snapshots, listings] = await Promise.all([
      readAllSnapshots(),
      readListings(),
    ]);

    // Determine which competitor_ids to include based on branch filter.
    const branchToCompetitorIds = new Map<string, Set<string>>();
    for (const branch of listings.branches) {
      branchToCompetitorIds.set(
        branch.branch_id,
        new Set(branch.competitors.map((c) => c.competitor_id)),
      );
    }

    let allowedCompetitorIds: Set<string> | null = null;
    if (branchId) {
      allowedCompetitorIds = branchToCompetitorIds.get(branchId) ?? new Set();
    }
    if (competitorId) {
      // Intersect with branch filter (if branchId was given).
      if (allowedCompetitorIds) {
        if (!allowedCompetitorIds.has(competitorId)) {
          allowedCompetitorIds = new Set();
        } else {
          allowedCompetitorIds = new Set([competitorId]);
        }
      } else {
        allowedCompetitorIds = new Set([competitorId]);
      }
    }

    // Gather all reviews from disk, applying competitor filter at the source.
    const all: Review[] = [];
    for (const [compId, reviews] of snapshots.entries()) {
      if (allowedCompetitorIds && !allowedCompetitorIds.has(compId)) continue;
      for (const r of reviews) all.push(r);
    }

    // Apply rating + text filters.
    const filtered = all.filter((r) => {
      if (ratingFilter) {
        if (r.rating === null) return false;
        const bucket = Math.round(r.rating);
        if (!ratingFilter.has(bucket)) return false;
      }
      if (q) {
        const name = (r.reviewer_name || "").toLowerCase();
        const text = (r.text || "").toLowerCase();
        if (!name.includes(q) && !text.includes(q)) return false;
      }
      return true;
    });

    // Sort: newest scraped_at first (stable-ish: ties broken by review_id).
    filtered.sort((a, b) => {
      const sa = a.scraped_at || "";
      const sb = b.scraped_at || "";
      if (sa !== sb) return sb.localeCompare(sa);
      return (b.review_id || "").localeCompare(a.review_id || "");
    });

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const data = filtered.slice(start, start + pageSize);

    const body: ReviewsResponse = { data, total, page, pageSize };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "reviews query failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
