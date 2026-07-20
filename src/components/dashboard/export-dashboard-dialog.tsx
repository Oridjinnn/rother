"use client";

import * as React from "react";
import {
  Download,
  FileJson,
  FileSpreadsheet,
  Loader2,
  Package,
  X,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

interface ExportDashboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Total reviews count (for the reviews export label). */
  totalReviews?: number;
  /** Total history runs count (for the history export label). */
  totalRuns?: number;
}

interface ExportOption {
  id: string;
  label: string;
  description: string;
  icon: typeof FileSpreadsheet;
  url: string;
  color: string;
}

/**
 * Data Export Dashboard — a modal dialog combining all export options
 * in one place. Shows the available exports (reviews CSV/JSON, history
 * CSV/JSON) with descriptions + download buttons.
 *
 * Each export triggers a browser download via fetch + Blob URL. Shows
 * a loading state on the button during the request + a toast on
 * success/failure.
 */
export function ExportDashboardDialog({
  open,
  onOpenChange,
  totalReviews = 0,
  totalRuns = 0,
}: ExportDashboardDialogProps) {
  const [exporting, setExporting] = React.useState<string | null>(null);

  const handleExport = async (option: ExportOption) => {
    setExporting(option.id);
    try {
      const res = await fetch(option.url, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `export failed (${res.status})`);
      }
      const cd = res.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename="?([^";]+)"?/);
      const filename = m?.[1] || `export.${option.id.includes("json") ? "json" : "csv"}`;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`${option.label} ready`, {
        description: `→ ${filename}`,
      });
    } catch (err) {
      toast.error("Export failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setExporting(null);
    }
  };

  const reviewsOptions: ExportOption[] = [
    {
      id: "reviews-csv",
      label: "Reviews CSV",
      description: "All reviews with branch/competitor names joined. Excel/Sheets compatible.",
      icon: FileSpreadsheet,
      url: "/api/reviews/export?format=csv",
      color: "text-emerald-600 dark:text-emerald-400",
    },
    {
      id: "reviews-json",
      label: "Reviews JSON",
      description: "Raw structured review data with enriched fields.",
      icon: FileJson,
      url: "/api/reviews/export?format=json",
      color: "text-teal-600 dark:text-teal-400",
    },
  ];

  const historyOptions: ExportOption[] = [
    {
      id: "history-csv",
      label: "History CSV",
      description: "One row per run × competitor. Spreadsheet-friendly timeline.",
      icon: FileSpreadsheet,
      url: "/api/history/export?format=csv",
      color: "text-emerald-600 dark:text-emerald-400",
    },
    {
      id: "history-json",
      label: "History JSON",
      description: "Nested runs with per-competitor breakdown.",
      icon: FileJson,
      url: "/api/history/export?format=json",
      color: "text-teal-600 dark:text-teal-400",
    },
  ];

  const renderOption = (option: ExportOption, count: number) => {
    const Icon = option.icon;
    const isExporting = exporting === option.id;
    const disabled = isExporting || count === 0;
    return (
      <div
        key={option.id}
        className="flex items-center gap-3 rounded-lg border border-border/40 bg-muted/20 p-3 transition-colors hover:border-primary/30"
      >
        <Icon className={"size-5 shrink-0 " + option.color} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">{option.label}</div>
          <div className="text-[11px] text-muted-foreground">{option.description}</div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleExport(option)}
          disabled={disabled}
          className="shrink-0 gap-1.5"
          aria-label={`Download ${option.label}`}
        >
          {isExporting ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="size-3.5" aria-hidden="true" />
          )}
          <span className="hidden sm:inline">Download</span>
        </Button>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Package className="size-4 text-primary" aria-hidden="true" />
            Data Export
          </DialogTitle>
          <DialogDescription>
            Download the monitored data for offline analysis. All exports
            are free — no limits, no authentication.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto gbp-scrollbar px-5 py-4">
          {/* Reviews section */}
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Reviews ({totalReviews.toLocaleString()})
              </h3>
            </div>
            <div className="space-y-2">
              {reviewsOptions.map((opt) => renderOption(opt, totalReviews))}
            </div>
          </div>

          <Separator className="my-3" />

          {/* History section */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Run History ({totalRuns} run{totalRuns === 1 ? "" : "s"})
              </h3>
            </div>
            <div className="space-y-2">
              {historyOptions.map((opt) => renderOption(opt, totalRuns))}
            </div>
          </div>

          {totalReviews === 0 && totalRuns === 0 && (
            <div className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              No data available to export yet. Run the scraper first to
              populate the snapshots.
            </div>
          )}
        </div>

        <div className="border-t border-border/60 px-5 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="w-full gap-1.5"
          >
            <X className="size-3.5" aria-hidden="true" />
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
