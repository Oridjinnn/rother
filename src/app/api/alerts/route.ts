import { NextResponse } from "next/server";

import { sanitizeError } from "@/lib/gbp/sanitize";
import {
  readAllSnapshots,
  readAllDeltas,
  readListings,
  readRunSummary,
} from "@/lib/gbp/server-data";
import { readJsonFile } from "@/lib/gbp/server-data";
import { GBP_DATA_DIR } from "@/lib/gbp/paths";
import path from "node:path";
import type {
  Alert,
  AlertType,
  AlertSeverity,
} from "@/lib/gbp/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SELECTOR_REPORT_PATH = path.join(GBP_DATA_DIR, "selector_report.json");

interface SelectorReport {
  healthy?: number;
  degraded?: number;
  broken?: number;
  not_evaluated?: number;
  last_verified?: string;
}

export async function GET() {
  try {
    const alerts: Alert[] = [];

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [snapshots, deltas, listings, runSummary] = await Promise.all([
      readAllSnapshots(),
      readAllDeltas(),
      readListings(),
      readRunSummary(),
    ]);

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

    if (runSummary) {
      for (const err of runSummary.errors) {
        alerts.push({
          id: `scrape-fail-${err.competitor_id}-${runSummary.finished_at ?? runSummary.started_at}`,
          type: "scrape_failure" as AlertType,
          severity: "error" as AlertSeverity,
          title: "Scrape failed",
          description: `${compIdToName.get(err.competitor_id) ?? err.competitor_id} could not be scraped`,
          detail: err.error,
          competitor_id: err.competitor_id,
          source: "run_summary",
          timestamp: runSummary.finished_at ?? runSummary.started_at,
        });
      }

      if (runSummary.failed >= runSummary.success && runSummary.failed > 0) {
        alerts.push({
          id: `run-issues-${runSummary.finished_at ?? runSummary.started_at}`,
          type: "run_failure" as AlertType,
          severity: "warning" as AlertSeverity,
          title: "Scrape run had failures",
          description: `${runSummary.failed} of ${runSummary.success + runSummary.failed} sources failed`,
          source: "run_summary",
          timestamp: runSummary.finished_at ?? runSummary.started_at,
        });
      }
    }

    const deltasByComp = new Map<string, typeof deltas>();
    for (const d of deltas) {
      const arr = deltasByComp.get(d.competitor_id) ?? [];
      arr.push(d);
      deltasByComp.set(d.competitor_id, arr);
    }

    for (const [compId, compDeltas] of deltasByComp) {
      const counts = compDeltas.map((d) => d.reviews.length);
      const totalFromDeltas = counts.reduce((a, b) => a + b, 0);
      const avgCount = counts.length > 0 ? totalFromDeltas / counts.length : 0;
      const latestCount = counts[0] ?? 0;

      if (latestCount > 0) {
        const name = compIdToName.get(compId) ?? compId;
        const branchId = compIdToBranchId.get(compId) ?? "";
        const branchName = branchIdToName.get(branchId) ?? branchId;

        alerts.push({
          id: `new-reviews-${compId}-${compDeltas[0].run_timestamp}`,
          type: "new_reviews" as AlertType,
          severity: "info" as AlertSeverity,
          title: `New reviews for ${name}`,
          description: `${latestCount} new review${latestCount === 1 ? "" : "s"} in the latest scrape`,
          detail: `${branchName} · ${name}`,
          competitor_id: compId,
          branch_id: branchId,
          delta_count: latestCount,
          source: "delta",
          timestamp: compDeltas[0].run_timestamp,
        });

        if (avgCount > 0 && latestCount > avgCount * 3 && counts.length >= 2) {
          alerts.push({
            id: `spike-${compId}-${compDeltas[0].run_timestamp}`,
            type: "large_review_increase" as AlertType,
            severity: "warning" as AlertSeverity,
            title: "Unusual review spike",
            description: `${name} got ${latestCount} new reviews (${Math.round(latestCount / avgCount)}x the average of ${Math.round(avgCount)})`,
            detail: `Previous runs averaged ${Math.round(avgCount)} new reviews`,
            competitor_id: compId,
            branch_id: branchId,
            delta_count: latestCount,
            source: "delta",
            timestamp: compDeltas[0].run_timestamp,
          });
        }
      }
    }

    const selectorReport = await readJsonFile<SelectorReport | null>(
      SELECTOR_REPORT_PATH,
      null,
    );
    if (selectorReport) {
      if ((selectorReport.broken ?? 0) > 0) {
        alerts.push({
          id: "selectors-broken",
          type: "selector_degradation" as AlertType,
          severity: "error" as AlertSeverity,
          title: "CSS selectors are broken",
          description: `${selectorReport.broken} selector(s) are broken — reviews may not be parsed correctly`,
          source: "selector_report",
          timestamp: selectorReport.last_verified ?? new Date().toISOString(),
        });
      }
      if ((selectorReport.degraded ?? 0) > 0) {
        alerts.push({
          id: "selectors-degraded",
          type: "selector_degradation" as AlertType,
          severity: "warning" as AlertSeverity,
          title: "CSS selectors degraded",
          description: `${selectorReport.degraded} selector(s) are degraded (falling back to tier 2+)`,
          source: "selector_report",
          timestamp: selectorReport.last_verified ?? new Date().toISOString(),
        });
      }
    }

    alerts.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    return NextResponse.json(
      { alerts, total: alerts.length },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: "alerts query failed",
        detail: sanitizeError(err),
      },
      { status: 500 },
    );
  }
}
