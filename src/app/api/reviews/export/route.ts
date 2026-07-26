import { NextResponse } from "next/server";

import type { Review } from "@/lib/gbp/types";
import { readAllSnapshots, readListings } from "@/lib/gbp/server-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/reviews/export?format=csv|json&branch_id=&competitor_id=&rating=&q=
 *
 * Exports ALL reviews matching the filter (no pagination) as a CSV or JSON
 * download. Same filter semantics as /api/reviews, but:
 *   - no page/pageSize (returns everything)
 *   - adds a Content-Disposition header so the browser downloads the file
 *   - CSV includes a header row + branch_name + competitor_name columns
 *     (joined from listings.json so the export is self-describing)
 *
 * The export is synchronous and reads from disk on every call (no caching).
 * For very large datasets a future streaming implementation would be better,
 * but for the GBP Monitor's scale (≤ low-thousands of reviews per scrape)
 * this is fine.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const format = (searchParams.get("format") || "csv").toLowerCase();
    const branchId = searchParams.get("branch_id") || undefined;
    const competitorId = searchParams.get("competitor_id") || undefined;
    const ratingParam = searchParams.get("rating") || undefined;
    const q = (searchParams.get("q") || "").trim().toLowerCase() || undefined;

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

    // Build id→name maps so the export is self-describing.
    const compIdToName = new Map<string, string>();
    const branchIdToName = new Map<string, string>();
    for (const branch of listings.branches) {
      branchIdToName.set(branch.branch_id, branch.branch_name);
      for (const comp of branch.competitors) {
        compIdToName.set(comp.competitor_id, comp.name);
      }
    }

    // Determine allowed competitor_ids from filters.
    const branchToCompIds = new Map<string, Set<string>>();
    for (const branch of listings.branches) {
      branchToCompIds.set(
        branch.branch_id,
        new Set(branch.competitors.map((c) => c.competitor_id)),
      );
    }
    let allowed: Set<string> | null = null;
    if (branchId) {
      allowed = branchToCompIds.get(branchId) ?? new Set();
    }
    if (competitorId) {
      if (allowed) {
        allowed = allowed.has(competitorId) ? new Set([competitorId]) : new Set();
      } else {
        allowed = new Set([competitorId]);
      }
    }

    const all: Review[] = [];
    for (const [compId, reviews] of snapshots.entries()) {
      if (allowed && !allowed.has(compId)) continue;
      for (const r of reviews) all.push(r);
    }

    const filtered = all.filter((r) => {
      if (ratingFilter) {
        if (r.rating === null) return false;
        if (!ratingFilter.has(Math.round(r.rating))) return false;
      }
      if (q) {
        const name = (r.reviewer_name || "").toLowerCase();
        const text = (r.text || "").toLowerCase();
        if (!name.includes(q) && !text.includes(q)) return false;
      }
      return true;
    });

    // Sort newest scraped_at first
    filtered.sort((a, b) => {
      const sa = a.scraped_at || "";
      const sb = b.scraped_at || "";
      if (sa !== sb) return sb.localeCompare(sa);
      return (b.review_id || "").localeCompare(a.review_id || "");
    });

    if (format === "json") {
      const enriched = filtered.map((r) => ({
        ...r,
        reviewer_name: r.reviewer_name?.replace(/,\s*original\s*$/i, "") ?? null,
        competitor_name: compIdToName.get(r.competitor_id) ?? r.competitor_id,
        branch_name: branchIdToName.get(r.branch_id) ?? r.branch_id,
      }));
      const json = JSON.stringify(enriched, null, 2);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      return new NextResponse(json, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="rother-reviews-${stamp}.json"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // Default: CSV
    const header = [
      "review_id",
      "competitor_id",
      "competitor_name",
      "branch_id",
      "branch_name",
      "reviewer_name",
      "rating",
      "relative_date",
      "text",
      "scraped_at",
    ];
    const escapeCsv = (val: string | null | undefined): string => {
      if (val === null || val === undefined) return "";
      // RFC 4180: wrap in quotes if contains comma, quote, newline; double-up quotes.
      const s = String(val);
      if (/[",\n\r]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const rows = filtered.map((r) =>
      [
        r.review_id,
        r.competitor_id,
        compIdToName.get(r.competitor_id) ?? r.competitor_id,
        r.branch_id,
        branchIdToName.get(r.branch_id) ?? r.branch_id,
        r.reviewer_name?.replace(/,\s*original\s*$/i, "") ?? "",
        r.rating?.toString() ?? "",
        r.relative_date ?? "",
        r.text ?? "",
        r.scraped_at,
      ]
        .map(escapeCsv)
        .join(","),
    );
    const csv = [header.join(","), ...rows].join("\r\n");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="rother-reviews-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "reviews export failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
