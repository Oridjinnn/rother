import { NextResponse } from "next/server";

import { sanitizeError } from "@/lib/gbp/sanitize";
import { readAllDeltas } from "@/lib/gbp/server-data";
import { readListings } from "@/lib/gbp/server-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/history
 *
 * Returns a chronological timeline of every scraper run that produced new
 * reviews, aggregated by run timestamp. Used by the Run History timeline
 * panel on the Overview tab.
 *
 * Each delta file is named `{competitor_id}_{YYYYMMDDTHHMMSSZ}.json` and
 * contains the NEW reviews from that run for that competitor. Multiple
 * competitors' deltas share the same run timestamp (the orchestrator runs
 * all competitors in one pass), so we group by run_timestamp.
 *
 * Response shape:
 *   {
 *     runs: [
 *       {
 *         run_timestamp: "2026-07-20T08:35:48Z",
 *         total_new_reviews: 20,
 *         competitors_with_new: 3,
 *         branches_affected: ["cph-seminyak", "cph-canggu", "cph-ubud"],
 *         breakdown: [
 *           { competitor_id, competitor_name, branch_id, branch_name, count }
 *         ]
 *       }
 *     ],
 *     totalRuns: 1
 *   }
 */
export async function GET() {
  try {
    const [deltas, listings] = await Promise.all([
      readAllDeltas(),
      readListings(),
    ]);

    // Build id→name maps
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

    // Group deltas by run_timestamp
    const byRun = new Map<
      string,
      Array<{ competitor_id: string; count: number }>
    >();
    for (const d of deltas) {
      const arr = byRun.get(d.run_timestamp) ?? [];
      arr.push({ competitor_id: d.competitor_id, count: d.reviews.length });
      byRun.set(d.run_timestamp, arr);
    }

    const runs = Array.from(byRun.entries())
      .map(([run_timestamp, items]) => {
        const breakdown = items.map((it) => {
          const branch_id = compIdToBranchId.get(it.competitor_id) ?? "";
          return {
            competitor_id: it.competitor_id,
            competitor_name:
              compIdToName.get(it.competitor_id) ?? it.competitor_id,
            branch_id,
            branch_name: branchIdToName.get(branch_id) ?? branch_id,
            count: it.count,
          };
        });
        const branchesAffected = Array.from(
          new Set(breakdown.map((b) => b.branch_id).filter(Boolean)),
        );
        const total_new_reviews = breakdown.reduce((s, b) => s + b.count, 0);
        return {
          run_timestamp,
          total_new_reviews,
          competitors_with_new: breakdown.length,
          branches_affected: branchesAffected,
          breakdown,
        };
      })
      .sort((a, b) => b.run_timestamp.localeCompare(a.run_timestamp));

    return NextResponse.json(
      { runs, totalRuns: runs.length },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: "history query failed",
        detail: sanitizeError(err),
      },
      { status: 500 },
    );
  }
}
