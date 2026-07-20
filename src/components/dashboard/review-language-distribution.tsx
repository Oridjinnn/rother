"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Globe, RefreshCw } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { EmptyState } from "./empty-state";
import type { Review } from "@/lib/gbp/types";

interface ReviewLanguageDistributionProps {
  /** Bump to force a refetch. */
  refreshKey?: number;
}

interface LangEntry {
  code: string;
  label: string;
  count: number;
  color: string;
}

/**
 * Detect the language of a review text using simple character-set heuristics.
 * NOT AI/LLM — just Unicode range checks. Detects:
 *   - Latin (English/Indonesian/European — we label as "Latin" since we
 *     can't reliably distinguish English from Indonesian without a dictionary)
 *   - CJK (Chinese/Japanese/Korean — unified Han + Hiragana + Katakana + Hangul)
 *   - Cyrillic (Russian/etc.)
 *   - Arabic
 *   - Devanagari (Hindi/etc.)
 *   - Other (anything else)
 *
 * If a review has mixed scripts, the first detected non-Latin script wins
 * (Latin is the fallback/default for most reviews in this dataset).
 */
function detectLanguage(text: string): string {
  if (!text) return "unknown";
  // Check for non-Latin scripts first (they're more distinctive)
  // CJK Unified Ideographs: U+4E00–U+9FFF
  // Hiragana: U+3040–U+309F
  // Katakana: U+30A0–U+30FF
  // Hangul Syllables: U+AC00–U+D7AF
  // CJK Unified Ideographs Extension A: U+3400–U+4DBF
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    if (
      (cp >= 0x4e00 && cp <= 0x9fff) ||
      (cp >= 0x3400 && cp <= 0x4dbf) ||
      (cp >= 0x3040 && cp <= 0x309f) ||
      (cp >= 0x30a0 && cp <= 0x30ff)
    ) {
      return "cjk";
    }
    if (cp >= 0xac00 && cp <= 0xd7af) {
      return "ko";
    }
    // Cyrillic: U+0400–U+04FF
    if (cp >= 0x0400 && cp <= 0x04ff) {
      return "cyrillic";
    }
    // Arabic: U+0600–U+06FF
    if (cp >= 0x0600 && cp <= 0x06ff) {
      return "arabic";
    }
    // Devanagari: U+0900–U+097F
    if (cp >= 0x0900 && cp <= 0x097f) {
      return "devanagari";
    }
  }
  // If we get here, the text is all Latin (or Latin + punctuation/numbers)
  return "latin";
}

const LANG_META: Record<string, { label: string; color: string }> = {
  latin: {
    label: "Latin (EN/ID/EU)",
    color: "oklch(0.55 0.13 165)", // emerald
  },
  cjk: {
    label: "Chinese/Japanese",
    color: "oklch(0.62 0.14 35)", // terracotta
  },
  ko: {
    label: "Korean",
    color: "oklch(0.70 0.15 75)", // amber
  },
  cyrillic: {
    label: "Cyrillic (RU/etc.)",
    color: "oklch(0.55 0.10 200)", // teal
  },
  arabic: {
    label: "Arabic",
    color: "oklch(0.65 0.18 320)", // frangipani
  },
  devanagari: {
    label: "Devanagari (HI/etc.)",
    color: "oklch(0.60 0.10 150)", // moss
  },
  unknown: {
    label: "Unknown",
    color: "oklch(0.65 0.10 200)", // muted
  },
};

/**
 * Review Language Distribution — a horizontal bar chart showing the
 * distribution of review languages detected via Unicode character-set
 * heuristics. NOT AI/LLM — just script-range checks.
 *
 * Self-fetches from /api/reviews (page 1, max pageSize) on mount + when
 * refreshKey changes. Detects each review's language and aggregates.
 */
export function ReviewLanguageDistribution({
  refreshKey,
}: ReviewLanguageDistributionProps) {
  const [reviews, setReviews] = React.useState<Review[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchReviews = React.useCallback(async () => {
    try {
      setError(null);
      const params = new URLSearchParams({
        page: "1",
        pageSize: "100",
      });
      const res = await fetch(`/api/reviews?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setReviews(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    setLoading(true);
    fetchReviews();
  }, [fetchReviews, refreshKey]);

  const entries = React.useMemo<LangEntry[]>(() => {
    const counts = new Map<string, number>();
    for (const r of reviews) {
      const lang = detectLanguage(r.text ?? "");
      counts.set(lang, (counts.get(lang) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([code, count]) => ({
        code,
        count,
        label: LANG_META[code]?.label ?? code,
        color: LANG_META[code]?.color ?? "oklch(0.65 0.10 200)",
      }))
      .sort((a, b) => b.count - a.count);
  }, [reviews]);

  const total = entries.reduce((s, e) => s + e.count, 0);
  const maxCount = entries.length > 0 ? entries[0].count : 0;

  if (loading && reviews.length === 0) {
    return (
      <Card className="gbp-card-hover">
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-6 rounded-md" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="gbp-card-hover">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="size-4 text-primary" aria-hidden="true" />
            Review Languages
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={RefreshCw}
            title="Couldn't load languages"
            description={error}
            className="h-[160px]"
          />
        </CardContent>
      </Card>
    );
  }

  if (total === 0) {
    return (
      <Card className="gbp-card-hover">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="size-4 text-primary" aria-hidden="true" />
            Review Languages
          </CardTitle>
          <CardDescription>
            Script-based language detection (no AI — Unicode range checks).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Globe}
            title="No review text yet"
            description="The chart will populate once reviews are collected."
            className="h-[160px]"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gbp-card-hover">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="size-4 text-primary" aria-hidden="true" />
              Review Languages
              <Badge
                variant="outline"
                className="ml-1 px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
              >
                {total} review{total === 1 ? "" : "s"}
              </Badge>
            </CardTitle>
            <CardDescription>
              Script-based detection (Unicode ranges) — no AI/LLM. Shows
              what scripts customers review in.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchReviews}
            className="text-xs text-muted-foreground hover:text-foreground"
            aria-label="Refresh language distribution"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="space-y-1.5">
          {entries.map((entry, idx) => {
            const pct = total > 0 ? (entry.count / total) * 100 : 0;
            const barWidthPct =
              maxCount > 0 ? (entry.count / maxCount) * 100 : 0;
            return (
              <motion.li
                key={entry.code}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: idx * 0.04 }}
              >
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className="size-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: entry.color }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                    {entry.label}
                  </span>
                  <span className="shrink-0 font-bold tabular-nums text-foreground">
                    {entry.count}
                  </span>
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                    ({pct.toFixed(0)}%)
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted pl-5">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${barWidthPct}%` }}
                    transition={{
                      duration: 0.4,
                      delay: idx * 0.04 + 0.1,
                      ease: "easeOut",
                    }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                </div>
              </motion.li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
