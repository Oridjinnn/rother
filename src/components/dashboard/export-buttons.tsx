"use client";

import * as React from "react";
import { Download, FileJson, FileSpreadsheet, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

interface ExportButtonsProps {
  /** Query params to pass through to the export endpoint (same filters as
   * the reviews table). */
  branchId?: string;
  competitorId?: string;
  ratings?: number[];
  search?: string;
  /** Disable when there's nothing to export. */
  disabled?: boolean;
  /** Total count of reviews that will be exported (for the toast). */
  total?: number;
}

/**
 * CSV / JSON export dropdown for the Reviews tab.
 *
 * Triggers a browser download via a fetch + Blob URL (rather than a direct
 * link) so we can pass the current filter params dynamically and show a
 * loading state during the request. The download filename is set by the
 * server via the Content-Disposition header.
 */
export function ExportButtons({
  branchId,
  competitorId,
  ratings,
  search,
  disabled,
  total = 0,
}: ExportButtonsProps) {
  const [isExporting, setIsExporting] = React.useState<"csv" | "json" | null>(
    null,
  );

  const doExport = async (format: "csv" | "json") => {
    if (disabled || total === 0) {
      toast.info("Nothing to export", {
        description: "No reviews match the current filters.",
      });
      return;
    }
    setIsExporting(format);
    try {
      const params = new URLSearchParams();
      params.set("format", format);
      if (branchId) params.set("branch_id", branchId);
      if (competitorId) params.set("competitor_id", competitorId);
      if (ratings && ratings.length > 0) {
        params.set("rating", ratings.join(","));
      }
      if (search && search.trim()) params.set("q", search.trim());

      const res = await fetch(`/api/reviews/export?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `export failed (${res.status})`);
      }
      // Extract filename from Content-Disposition (fallback to a default)
      const cd = res.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename="?([^";]+)"?/);
      const filename = m?.[1] || `gbp-reviews.${format}`;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`${format.toUpperCase()} export ready`, {
        description: `${total} review${total === 1 ? "" : "s"} → ${filename}`,
      });
    } catch (err) {
      toast.error("Export failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || isExporting !== null || total === 0}
          className="gap-1.5"
          aria-label="Export reviews"
        >
          {isExporting !== null ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="size-4" aria-hidden="true" />
          )}
          <span className="hidden sm:inline">Export</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Export {total.toLocaleString()} review{total === 1 ? "" : "s"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => doExport("csv")}
          className="gap-2 cursor-pointer"
        >
          <FileSpreadsheet
            className="size-4 text-emerald-600 dark:text-emerald-400"
            aria-hidden="true"
          />
          <div className="flex flex-col">
            <span className="text-sm font-medium">CSV</span>
            <span className="text-[10px] text-muted-foreground">
              Excel / Sheets compatible
            </span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => doExport("json")}
          className="gap-2 cursor-pointer"
        >
          <FileJson
            className="size-4 text-teal-600 dark:text-teal-400"
            aria-hidden="true"
          />
          <div className="flex flex-col">
            <span className="text-sm font-medium">JSON</span>
            <span className="text-[10px] text-muted-foreground">
              Raw structured data
            </span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
