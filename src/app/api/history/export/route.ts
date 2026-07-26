import { NextResponse } from "next/server";

import { sanitizeError } from "@/lib/gbp/sanitize";
import { readAllDeltas } from "@/lib/gbp/server-data";
import { readListings } from "@/lib/gbp/server-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/history/export?format=csv|json
 *
 * Exports the full run history timeline as a CSV or JSON download.
 * Same data as GET /api/history, but:
 *   - no pagination (returns everything)
 *   - adds a Content-Disposition header so the browser downloads the file
 *   - CSV flattens the per-competitor breakdown into one row per
 *     (run_timestamp, competitor) pair — more useful for spreadsheet analysis
 *     than the nested JSON shape.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const format = (searchParams.get("format") || "csv").toLowerCase();

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

    // Group deltas by run timestamp (same logic as /api/history)
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

    if (format === "json") {
      const json = JSON.stringify(
        { runs, totalRuns: runs.length },
        null,
        2,
      );
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      return new NextResponse(json, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="rother-history-${stamp}.json"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // Default: CSV — one row per (run, competitor) pair
    const header = [
      "run_timestamp",
      "total_new_reviews",
      "competitors_with_new",
      "branches_affected_count",
      "competitor_id",
      "competitor_name",
      "branch_id",
      "branch_name",
      "new_reviews_for_competitor",
    ];
    const escapeCsv = (val: unknown): string => {
      if (val === null || val === undefined) return "";
      const s = String(val);
      if (/[",\n\r]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const rows: string[] = [];
    for (const run of runs) {
      for (const b of run.breakdown) {
        rows.push(
          [
            run.run_timestamp,
            run.total_new_reviews,
            run.competitors_with_new,
            run.branches_affected.length,
            b.competitor_id,
            b.competitor_name,
            b.branch_id,
            b.branch_name,
            b.count,
          ]
            .map(escapeCsv)
            .join(","),
        );
      }
      // If a run had no breakdown (shouldn't happen, but defensive), still emit a row
      if (run.breakdown.length === 0) {
        rows.push(
          [
            run.run_timestamp,
            run.total_new_reviews,
            0,
            0,
            "",
            "",
            "",
            "",
            0,
          ]
            .map(escapeCsv)
            .join(","),
        );
      }
    }
    const csv = [header.join(","), ...rows].join("\r\n");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="rother-history-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "history export failed",
        detail: sanitizeError(err),
      },
      { status: 500 },
    );
  }
}
