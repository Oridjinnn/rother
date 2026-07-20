"use client";

import * as React from "react";
import {
  ExternalLink,
  MessageSquare,
  Star,
  Store,
  TrendingUp,
  Users,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

import { StarRating } from "./star-rating";
import { EmptyState } from "./empty-state";
import { CopyButton } from "./copy-button";
import { cleanReviewerName, formatTimestamp } from "@/lib/gbp/format";
import type { CompetitorStats, Review } from "@/lib/gbp/types";

interface CompetitorDetailDialogProps {
  /** The competitor to show details for, or null to close the dialog. */
  competitor: CompetitorStats | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Modal dialog showing a single competitor's full review list + rating
 * distribution. Opens when the user clicks a competitor card in the
 * Compare tab. Self-fetches the competitor's reviews from /api/reviews
 * when opened (no parent data-passing needed).
 *
 * Shows:
 *   - Header: competitor name, branch, gmaps_url link, aggregate stats
 *   - Rating distribution mini-bar (1★–5★ counts)
 *   - Full review list (scrollable, with reviewer name + copy ID, rating,
 *     text, relative date)
 */
export function CompetitorDetailDialog({
  competitor,
  onOpenChange,
}: CompetitorDetailDialogProps) {
  const open = competitor !== null;
  const [reviews, setReviews] = React.useState<Review[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!competitor) {
      setReviews([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      competitor_id: competitor.competitor_id,
      page: "1",
      pageSize: "100",
    });
    fetch(`/api/reviews?${params.toString()}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = await r.json();
        if (cancelled) return;
        setReviews(json.data ?? []);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [competitor]);

  // Compute rating distribution from the fetched reviews
  const ratingDist = React.useMemo(() => {
    const dist = [0, 0, 0, 0, 0]; // index 0 = 1 star, index 4 = 5 stars
    for (const r of reviews) {
      if (r.rating !== null && r.rating >= 1 && r.rating <= 5) {
        dist[Math.round(r.rating) - 1]++;
      }
    }
    return dist;
  }, [reviews]);

  if (!competitor) return null;

  const ts = formatTimestamp(competitor.last_scraped_at);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl gap-0 overflow-hidden p-0">
        {/* Header */}
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle className="flex items-start gap-2 text-base">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 text-primary">
              <Store className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate">{competitor.name}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-normal text-muted-foreground">
                <span>{competitor.branch_name}</span>
                <span className="text-border">·</span>
                <span className="font-mono text-[10px]">
                  {competitor.competitor_id}
                </span>
              </div>
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Detailed view for competitor {competitor.name}
          </DialogDescription>
        </DialogHeader>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-px bg-border/40">
          <div className="bg-background px-4 py-3 text-center">
            <div className="flex items-center justify-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <Users className="size-2.5" aria-hidden="true" />
              Reviews
            </div>
            <div className="mt-0.5 text-xl font-bold tabular-nums text-foreground">
              {competitor.total_reviews}
            </div>
          </div>
          <div className="bg-background px-4 py-3 text-center">
            <div className="flex items-center justify-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <Star className="size-2.5" aria-hidden="true" />
              Avg Rating
            </div>
            <div className="mt-0.5">
              <StarRating
                rating={competitor.average_rating}
                size="sm"
                showValue
              />
            </div>
          </div>
          <div className="bg-background px-4 py-3 text-center">
            <div className="flex items-center justify-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <TrendingUp className="size-2.5" aria-hidden="true" />
              New
            </div>
            <div
              className={
                "mt-0.5 text-xl font-bold tabular-nums " +
                (competitor.new_reviews_count > 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-foreground")
              }
            >
              {competitor.new_reviews_count > 0
                ? `+${competitor.new_reviews_count}`
                : "0"}
            </div>
          </div>
        </div>

        {/* Rating distribution mini-bar */}
        {reviews.length > 0 && (
          <div className="border-b border-border/60 px-5 py-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Rating Distribution
            </div>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
              {ratingDist.map((count, i) => {
                const total = ratingDist.reduce((s, n) => s + n, 0);
                if (total === 0 || count === 0) return null;
                const pct = (count / total) * 100;
                const colors = [
                  "bg-red-500/70",
                  "bg-orange-500/70",
                  "bg-amber-500/70",
                  "bg-lime-500/70",
                  "bg-emerald-500/70",
                ];
                return (
                  <div
                    key={i}
                    className={colors[i]}
                    style={{ width: `${pct}%` }}
                    title={`${i + 1}★: ${count} review${count === 1 ? "" : "s"}`}
                  />
                );
              })}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              {[1, 2, 3, 4, 5].map((star) => (
                <span key={star}>
                  {star}★: {ratingDist[star - 1]}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Last scraped + gmaps link */}
        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-5 py-2.5 text-xs">
          <span className="text-muted-foreground">
            Last scraped: {competitor.last_scraped_at ? ts.relative : "—"}
          </span>
          <a
            href={competitor.gmaps_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            View on Google Maps
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        </div>

        {/* Review list */}
        <div className="max-h-[40vh] overflow-y-auto gbp-scrollbar px-5 py-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <MessageSquare className="size-3" aria-hidden="true" />
              Reviews ({reviews.length})
            </h3>
          </div>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-md" />
              ))}
            </div>
          ) : error ? (
            <EmptyState
              icon={MessageSquare}
              title="Couldn't load reviews"
              description={error}
            />
          ) : reviews.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="No reviews yet"
              description="This competitor has no scraped reviews."
            />
          ) : (
            <ul className="space-y-2">
              {reviews.map((r) => (
                <li
                  key={r.review_id}
                  className="rounded-md border border-border/40 bg-muted/20 p-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-foreground">
                        {cleanReviewerName(r.reviewer_name) ?? "Anonymous"}
                      </div>
                      <CopyButton
                        value={r.review_id}
                        label={`Copy review ID: ${r.review_id}`}
                        showText
                        displayText={r.review_id}
                        size="sm"
                      />
                    </div>
                    <StarRating rating={r.rating} size="sm" showValue={false} />
                  </div>
                  {r.text && (
                    <p className="mt-1.5 text-xs leading-relaxed text-foreground/80">
                      {r.text}
                    </p>
                  )}
                  <div className="mt-1.5 text-[10px] text-muted-foreground">
                    {r.relative_date ?? "—"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
