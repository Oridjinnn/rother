import { NextResponse } from "next/server";

import { sanitizeError } from "@/lib/gbp/sanitize";
import { readAllSnapshots } from "@/lib/gbp/server-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/competitor-correlation
 *
 * Returns a correlation matrix showing the similarity of rating
 * distributions between each pair of competitors. Uses cosine similarity
 * on the 1★–5★ rating count vectors.
 *
 * Response shape:
 *   {
 *     competitors: [{ competitor_id, name, branch_name, distribution: [c1,c2,c3,c4,c5] }],
 *     matrix: [[sim, sim, ...], [sim, sim, ...], ...],  // N×N, 0-1 scale
 *     maxCompetitors: number
 *   }
 *
 * Only includes competitors with >0 reviews. Capped at a config-driven
 * number of competitors (default 12, the top N by total reviews) so the
 * matrix stays readable. The old hardcoded 12 — see RISK-030 — is replaced
 * by MAX_COMPETITORS below.
 */

/** Config-driven competitor cap. Override via MAX_COMPETITORS env (0 = no cap). */
const MAX_COMPETITORS = (() => {
  const raw = process.env.MAX_COMPETITORS;
  if (raw === undefined || raw.trim() === "") return 12;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 12;
})();

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

export async function GET() {
  try {
    const snapshots = await readAllSnapshots();

    // Build per-competitor rating distributions [1★,2★,3★,4★,5★]
    const competitors: Array<{
      competitor_id: string;
      name: string;
      branch_name: string;
      distribution: number[];
      total: number;
    }> = [];

    // We need competitor names — read from listings
    const { readListings } = await import("@/lib/gbp/server-data");
    const listings = await readListings();
    const compIdToName = new Map<string, string>();
    const compIdToBranchName = new Map<string, string>();
    for (const branch of listings.branches) {
      for (const comp of branch.competitors) {
        compIdToName.set(comp.competitor_id, comp.name);
        compIdToBranchName.set(comp.competitor_id, branch.branch_name);
      }
    }

    for (const [compId, reviews] of snapshots.entries()) {
      if (reviews.length === 0) continue;
      const dist = [0, 0, 0, 0, 0]; // 1★-5★
      for (const r of reviews) {
        if (r.rating !== null && r.rating >= 1 && r.rating <= 5) {
          dist[Math.round(r.rating) - 1]++;
        }
      }
      const total = dist.reduce((s, c) => s + c, 0);
      if (total === 0) continue;
      competitors.push({
        competitor_id: compId,
        name: compIdToName.get(compId) ?? compId,
        branch_name: compIdToBranchName.get(compId) ?? "",
        distribution: dist,
        total,
      });
    }

    // Sort by total reviews desc, cap at MAX_COMPETITORS (0 = no cap)
    competitors.sort((a, b) => b.total - a.total);
    const capped =
      MAX_COMPETITORS > 0 ? competitors.slice(0, MAX_COMPETITORS) : competitors;

    // Build the N×N correlation matrix
    const n = capped.length;
    const matrix: number[][] = [];
    for (let i = 0; i < n; i++) {
      const row: number[] = [];
      for (let j = 0; j < n; j++) {
        if (i === j) {
          row.push(1); // self-similarity = 1
        } else {
          row.push(
            Math.round(cosineSimilarity(capped[i].distribution, capped[j].distribution) * 100) / 100,
          );
        }
      }
      matrix.push(row);
    }

    return NextResponse.json(
      {
        competitors: capped.map((c) => ({
          competitor_id: c.competitor_id,
          name: c.name,
          branch_name: c.branch_name,
          distribution: c.distribution,
        })),
        matrix,
        maxCompetitors: MAX_COMPETITORS,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: "competitor-correlation query failed",
        detail: sanitizeError(err),
      },
      { status: 500 },
    );
  }
}
