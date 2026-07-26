import { NextResponse } from "next/server";

import { sanitizeError } from "@/lib/gbp/sanitize";
import {
  readAllSnapshots,
  readSnapshotAt,
  listSnapshots,
  readListings,
} from "@/lib/gbp/server-data";
import type { HistoricalComparisonResponse } from "@/lib/gbp/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const competitorId = searchParams.get("competitor_id");
    const olderTs = searchParams.get("older_ts");
    const newerTs = searchParams.get("newer_ts");

    if (!competitorId) {
      return NextResponse.json(
        { error: "competitor_id is required" },
        { status: 400 },
      );
    }

    const [snapshots, listings] = await Promise.all([
      readAllSnapshots(),
      readListings(),
    ]);

    // Resolve the two snapshots to compare.
    let newerReviews;
    let olderReviews;

    if (newerTs && olderTs) {
      // Both specified: compare arbitrary two snapshots.
      [newerReviews, olderReviews] = await Promise.all([
        readSnapshotAt(competitorId, newerTs),
        readSnapshotAt(competitorId, olderTs),
      ]);
    } else if (newerTs) {
      // Only newer specified: compare against the previous snapshot (by timestamp order).
      const allSnapshots = await listSnapshots(competitorId);
      const newerEntry = allSnapshots.find((s) => s.timestamp === newerTs.replace(/:/g, "-"));
      const idx = newerEntry ? allSnapshots.indexOf(newerEntry) : -1;
      newerReviews = await readSnapshotAt(competitorId, newerTs);
      olderReviews = idx >= 0 && idx + 1 < allSnapshots.length
        ? await readSnapshotAt(competitorId, allSnapshots[idx + 1].timestamp)
        : [];
    } else if (olderTs) {
      // Only older specified: compare against the latest snapshot.
      olderReviews = await readSnapshotAt(competitorId, olderTs);
      const allSnapshots = await listSnapshots(competitorId);
      newerReviews = allSnapshots.length > 0
        ? await readSnapshotAt(competitorId, allSnapshots[0].timestamp)
        : [];
    } else {
      // Neither specified: compare latest snapshot vs previous snapshot.
      const allSnapshots = await listSnapshots(competitorId);
      if (allSnapshots.length >= 2) {
        newerReviews = await readSnapshotAt(competitorId, allSnapshots[0].timestamp);
        olderReviews = await readSnapshotAt(competitorId, allSnapshots[1].timestamp);
      } else if (allSnapshots.length === 1) {
        newerReviews = await readSnapshotAt(competitorId, allSnapshots[0].timestamp);
        olderReviews = snapshots.get(competitorId) ?? [];
      } else {
        newerReviews = snapshots.get(competitorId) ?? [];
        olderReviews = [];
      }
    }

    const currentIds = new Set(newerReviews.map((r) => r.review_id));
    const olderIds = new Set(olderReviews.map((r) => r.review_id));

    const newInNewer = newerReviews
      .filter((r) => !olderIds.has(r.review_id))
      .map((r) => r.review_id);

    const removedFromNewer = olderReviews
      .filter((r) => !currentIds.has(r.review_id))
      .map((r) => r.review_id);

    const ratingChanged = olderReviews
      .filter((o) => {
        const n = newerReviews.find((c) => c.review_id === o.review_id);
        return n && n.rating !== o.rating;
      })
      .map((o) => {
        const n = newerReviews.find((c) => c.review_id === o.review_id)!;
        return {
          review_id: o.review_id,
          old_rating: o.rating,
          new_rating: n.rating,
        };
      });

    const compIdToName = new Map<string, string>();
    const compIdToBranchId = new Map<string, string>();
    const branchIdToName = new Map<string, string>();
    for (const branch of listings.branches) {
      branchIdToName.set(branch.branch_id, branch.branch_name);
      for (const comp of branch.competitors) {
        compIdToName.set(comp.competitor_id, comp.name);
        compIdToBranchId.set(comp.competitor_id, branch.branch_id);
      }
    }

    const newerTimestamp = newerReviews.length > 0
      ? newerReviews[0]?.scraped_at ?? null
      : null;
    const olderTimestamp = olderReviews.length > 0
      ? olderReviews[0]?.scraped_at ?? null
      : null;

    const body: HistoricalComparisonResponse = {
      competitor_id: competitorId,
      competitor_name: compIdToName.get(competitorId) ?? competitorId,
      branch_name: branchIdToName.get(compIdToBranchId.get(competitorId) ?? "") ?? "",
      older: olderReviews.map((r) => ({
        review_id: r.review_id,
        rating: r.rating,
        text: r.text,
        relative_date: r.relative_date,
        scraped_at: r.scraped_at,
      })),
      newer: newerReviews.map((r) => ({
        review_id: r.review_id,
        rating: r.rating,
        text: r.text,
        relative_date: r.relative_date,
        scraped_at: r.scraped_at,
      })),
      older_timestamp: olderTimestamp,
      newer_timestamp: newerTimestamp,
      older_count: olderReviews.length,
      newer_count: newerReviews.length,
      new_in_newer: newInNewer,
      removed_from_newer: removedFromNewer,
      rating_changed: ratingChanged,
    };

    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "history comparison failed",
        detail: sanitizeError(err),
      },
      { status: 500 },
    );
  }
}
