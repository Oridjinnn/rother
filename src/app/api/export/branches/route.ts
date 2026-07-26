import { NextResponse } from "next/server";

import { sanitizeError } from "@/lib/gbp/sanitize";
import { readAllSnapshots, readLatestDelta, readListings } from "@/lib/gbp/server-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "csv";

    const [listings, snapshots] = await Promise.all([
      readListings(),
      readAllSnapshots(),
    ]);

    const rows: Record<string, unknown>[] = [];

    for (const branch of listings.branches) {
      let totalReviews = 0;
      let totalNew = 0;
      let compCount = 0;
      const scrapedDates: string[] = [];

      for (const comp of branch.competitors) {
        compCount++;
        const reviews = snapshots.get(comp.competitor_id) ?? [];
        totalReviews += reviews.length;
        const delta = await readLatestDelta(comp.competitor_id);
        totalNew += delta.length;
        for (const r of reviews) {
          if (r.scraped_at) scrapedDates.push(r.scraped_at);
        }
      }
      scrapedDates.sort();
      const lastScrape = scrapedDates.length > 0 ? scrapedDates[scrapedDates.length - 1] : null;

      rows.push({
        branch_id: branch.branch_id,
        branch_name: branch.branch_name,
        competitor_count: compCount,
        total_reviews: totalReviews,
        new_reviews_count: totalNew,
        last_scrape: lastScrape,
      });
    }

    if (format === "json") {
      return NextResponse.json(rows);
    }

    const headers = ["branch_id", "branch_name", "competitor_count", "total_reviews", "new_reviews_count", "last_scrape"];
    const csvLines = [
      headers.join(","),
      ...rows.map((r) =>
        headers.map((h) => {
          const v = r[h];
          if (v === null || v === undefined) return "";
          const s = String(v);
          return s.includes(",") || s.includes('"') || s.includes("\n")
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        }).join(","),
      ),
    ];

    return new NextResponse(csvLines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="rother-branches-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "export failed", detail: sanitizeError(err) },
      { status: 500 },
    );
  }
}
