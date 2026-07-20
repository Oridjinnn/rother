"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Cloud, RefreshCw } from "lucide-react";

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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { EmptyState } from "./empty-state";
import type { Review } from "@/lib/gbp/types";

interface ReviewWordCloudProps {
  /** Bump to force a refetch. */
  refreshKey?: number;
}

interface WordEntry {
  word: string;
  count: number;
}

// Common English stopwords to filter out. Not AI — just a static list.
// Includes contractions + common review filler words.
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "up", "about", "into", "through", "during",
  "before", "after", "above", "below", "between", "this", "that", "these",
  "those", "is", "are", "was", "were", "be", "been", "being", "have", "has",
  "had", "do", "does", "did", "will", "would", "could", "should", "may",
  "might", "must", "can", "shall", "i", "you", "he", "she", "it", "we",
  "they", "them", "their", "there", "here", "what", "which", "who", "when",
  "where", "why", "how", "all", "each", "every", "both", "few", "more",
  "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same",
  "so", "than", "too", "very", "just", "also", "if", "as", "my", "your",
  "his", "her", "its", "our", "us", "me", "him", "one", "two", "get", "got",
  "go", "went", "come", "came", "make", "made", "see", "seen", "know",
  "knew", "think", "thought", "say", "said", "tell", "told", "ask", "asked",
  "want", "wanted", "need", "needed", "like", "liked", "good", "great",
  "really", "very", "quite", "pretty", "much", "lot", "lots", "thing",
  "things", "way", "ways", "time", "times", "day", "days", "place", "places",
  "food", "drink", "coffee", "cafe", "restaurant", "shop", "store",
  // Bali-specific filler
  "bali", "seminyak", "canggu", "ubud", "uluwatu", "sanur", "nusa",
]);

const MAX_WORDS = 40;
const MIN_WORD_LENGTH = 3;
const MIN_COUNT = 1;

/**
 * Extract word frequencies from review texts. Pure function — no I/O,
 * no AI/LLM. Just splits on non-letter characters, lowercases, filters
 * stopwords + short words, and counts.
 */
function extractWordFrequency(reviews: Review[]): WordEntry[] {
  const counts = new Map<string, number>();
  for (const r of reviews) {
    if (!r.text) continue;
    // Split on non-letter characters (handles punctuation, whitespace, etc.)
    const words = r.text.toLowerCase().split(/[^a-z]+/);
    for (const w of words) {
      if (w.length < MIN_WORD_LENGTH) continue;
      if (STOPWORDS.has(w)) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([word, count]) => ({ word, count }))
    .filter((e) => e.count >= MIN_COUNT)
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_WORDS);
}

const COLOR_PALETTE = [
  "text-primary",
  "text-emerald-600 dark:text-emerald-400",
  "text-amber-600 dark:text-amber-400",
  "text-teal-600 dark:text-teal-400",
  "text-orange-600 dark:text-orange-400",
  "text-foreground",
  "text-muted-foreground",
];

function getWordStyle(count: number, maxCount: number): {
  fontSize: number;
  colorClass: string;
  weight: string;
} {
  // Scale font size between 12px and 32px based on count relative to max.
  const ratio = maxCount > 0 ? count / maxCount : 0;
  const fontSize = Math.round(12 + ratio * 20); // 12px to 32px
  // Color: top 20% get primary, next 20% emerald, etc.
  const colorIdx =
    ratio > 0.8 ? 0
    : ratio > 0.6 ? 1
    : ratio > 0.4 ? 2
    : ratio > 0.2 ? 3
    : ratio > 0.1 ? 4
    : 5;
  const weight =
    ratio > 0.6 ? "font-bold"
    : ratio > 0.3 ? "font-semibold"
    : "font-medium";
  return { fontSize, colorClass: COLOR_PALETTE[colorIdx], weight };
}

/**
 * Review Word Cloud — a text-based word cloud showing the most frequent
 * words across all monitored reviews (excluding stopwords). No AI/LLM —
 * pure client-side word frequency counting.
 *
 * Self-fetches from /api/reviews (page 1, max pageSize) on mount + when
 * refreshKey changes. Renders the top 40 words with size + color scaled
 * by frequency. Each word has a tooltip showing its exact count.
 */
export function ReviewWordCloud({ refreshKey }: ReviewWordCloudProps) {
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

  const words = React.useMemo(() => extractWordFrequency(reviews), [reviews]);
  const maxCount = words.length > 0 ? words[0].count : 0;
  const totalWords = words.reduce((s, w) => s + w.count, 0);

  return (
    <Card className="gbp-card-hover">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Cloud className="size-4 text-primary" aria-hidden="true" />
              Review Word Cloud
              {totalWords > 0 && (
                <Badge
                  variant="outline"
                  className="ml-1 px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
                >
                  {words.length} unique · {totalWords} total
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Most frequent words across all reviews (common words filtered out).
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchReviews}
            className="text-xs text-muted-foreground hover:text-foreground"
            aria-label="Refresh word cloud"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[200px] w-full rounded-md" />
        ) : error ? (
          <EmptyState
            icon={RefreshCw}
            title="Couldn't load word cloud"
            description={error}
            className="h-[200px]"
          />
        ) : words.length === 0 ? (
          <EmptyState
            icon={Cloud}
            title="No review text yet"
            description="The word cloud will populate once the scraper collects reviews with text."
            className="h-[200px]"
          />
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="flex flex-wrap items-center gap-x-2 gap-y-1.5"
            role="list"
            aria-label="Most frequent review words"
          >
            {words.map((entry, idx) => {
              const style = getWordStyle(entry.count, maxCount);
              return (
                <TooltipProvider key={entry.word} delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <motion.span
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{
                          duration: 0.2,
                          delay: Math.min(idx * 0.01, 0.5),
                        }}
                        role="listitem"
                        className={
                          "cursor-default leading-relaxed transition-colors hover:underline " +
                          style.colorClass +
                          " " +
                          style.weight
                        }
                        style={{ fontSize: `${style.fontSize}px` }}
                      >
                        {entry.word}
                      </motion.span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p className="font-semibold font-mono">{entry.word}</p>
                      <p className="text-xs opacity-90">
                        <span className="font-bold tabular-nums">
                          {entry.count}
                        </span>{" "}
                        occurrence{entry.count === 1 ? "" : "s"}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
