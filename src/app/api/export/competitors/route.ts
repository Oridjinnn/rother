import { NextResponse } from "next/server";

import { sanitizeError } from "@/lib/gbp/sanitize";
import { readAllSnapshots, readLatestDelta, readListings, readAllDeltas } from "@/lib/gbp/server-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "csv";

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

    const rows: Record<string, unknown>[] = [];

    for (const branch of listings.branches) {
      for (const comp of branch.competitors) {
        const reviews = snapshots.get(comp.competitor_id) ?? [];
        const validRatings = reviews
          .map((r) => r.rating)
          .filter((r): r is number => r !== null && !Number.isNaN(r));
        const avgRating =
          validRatings.length > 0
            ? Math.round((validRatings.reduce((a, b) => a + b, 0) / validRatings.length) * 100) / 100
            : null;
        const delta = await readLatestDelta(comp.competitor_id);
        const texts = reviews.map((r) => r.text).filter(Boolean) as string[];
        const avgLen =
          texts.length > 0
            ? Math.round(texts.reduce((s, t) => s + t.length, 0) / texts.length)
            : null;
        const lastReview = reviews.length > 0
          ? reviews.sort((a, b) => (b.scraped_at || "").localeCompare(a.scraped_at || ""))[0]
          : null;

        rows.push({
          competitor_id: comp.competitor_id,
          name: comp.name,
          branch_id: branch.branch_id,
          branch_name: branch.branch_name,
          gmaps_url: comp.gmaps_url,
          total_reviews: reviews.length,
          average_rating: avgRating,
          new_reviews_count: delta.length,
          average_review_length: avgLen,
          latest_review_text: lastReview?.text ?? "",
          latest_review_date: lastReview?.relative_date ?? "",
          last_scraped_at: reviews.length > 0
            ? [...reviews].sort((a, b) => (b.scraped_at || "").localeCompare(a.scraped_at || ""))[0]?.scraped_at ?? ""
            : "",
        });
      }
    }

    if (format === "json") {
      return NextResponse.json(rows);
    }

    const headers = [
      "competitor_id", "name", "branch_id", "branch_name", "gmaps_url",
      "total_reviews", "average_rating", "new_reviews_count",
      "average_review_length", "latest_review_text", "latest_review_date",
      "last_scraped_at",
    ];
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
    const csv = csvLines.join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="rother-competitors-${new Date().toISOString().slice(0, 10)}.csv"`,
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
