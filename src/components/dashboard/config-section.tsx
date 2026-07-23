"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  FileJson,
  Settings2,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { EmptyState } from "./empty-state";
import type { ListingsConfig, SelectorsConfig, VerifiedBy } from "@/lib/gbp/types";

interface ConfigSectionProps {
  refreshKey?: number;
}

/** A hand-rolled JSON syntax highlighter. Tokenizes JSON strings and wraps
 *  tokens in <span> with theme-aware CSS variable colors. Avoids the heavy
 *  react-syntax-highlighter bundle + handles light/dark via CSS variables. */
function JsonHighlight({ value }: { value: string }) {
  const html = React.useMemo(() => tokenizeJson(value), [value]);
  return (
    <pre
      className="gbp-scrollbar max-h-[65vh] overflow-auto rounded-lg border border-border/60 bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-200 dark:bg-zinc-950/90"
      aria-label="JSON content"
    >
      <code dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
}

/** Tokenize a JSON string into colored HTML spans.
 *  Colors use inline styles with CSS variables so they adapt to dark mode. */
function tokenizeJson(json: string): string {
  // Escape HTML first.
  const esc = json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  // Regex matches: strings (keys + values), numbers, booleans, null.
  // Keys are strings followed by ':'.
  return esc.replace(
    /("(?:\\.|[^"\\])*")\s*(:)|("(?:\\.|[^"\\])*")|(\b-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\btrue\b|\bfalse\b)|(\bnull\b)/g,
    (match, key, colon, str, num, bool, nul) => {
      if (key) {
        return `<span style="color:#7dd3fc">${key}</span><span style="color:#94a3b8">${colon}</span>`;
      }
      if (str) {
        return `<span style="color:#86efac">${str}</span>`;
      }
      if (num) {
        return `<span style="color:#fbbf24">${num}</span>`;
      }
      if (bool) {
        return `<span style="color:#c4b5fd">${bool}</span>`;
      }
      if (nul) {
        return `<span style="color:#fda4af;font-style:italic">${nul}</span>`;
      }
      return match;
    },
  );
}

const verificationMeta: Record<
  VerifiedBy,
  { label: string; icon: typeof ShieldCheck; tone: "warn" | "ok" }
> = {
  seed: { label: "seed (UNPROVEN)", icon: ShieldAlert, tone: "warn" },
  browser_agent: { label: "browser_agent", icon: ShieldCheck, tone: "ok" },
  manual_human: { label: "manual_human", icon: ShieldCheck, tone: "ok" },
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard may be blocked — silent */
        }
      }}
      aria-label="Copy JSON to clipboard"
      className="h-7 text-xs"
    >
      {copied ? (
        <>
          <Check className="size-3 text-emerald-500" aria-hidden="true" />
          Copied
        </>
      ) : (
        <>
          <Copy className="size-3" aria-hidden="true" />
          Copy
        </>
      )}
    </Button>
  );
}

function SelectorsHeader({ selectors }: { selectors: SelectorsConfig }) {
  const verifiedBy = selectors.verified_by ?? "seed";
  const meta = verificationMeta[verifiedBy] ?? verificationMeta.seed;
  const VIcon = meta.icon;
  const isUnproven = verifiedBy === "seed";
  return (
    <div className="space-y-3">
      {isUnproven && (
        <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200">
          <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <AlertTitle className="text-amber-800 dark:text-amber-200">
            Selectors are UNPROVEN against live Google Maps DOM
          </AlertTitle>
          <AlertDescription className="text-amber-700/90 dark:text-amber-300/90">
            <code className="font-mono">verified_by</code> is{" "}
            <code className="font-mono font-semibold">"seed"</code> — these selectors were copied from
            public reference implementations (~2023 vintage) and have NOT been
            checked against the current Google Maps DOM. Live-mode scrapes will
            likely fail with <code className="font-mono">SelectorNotFoundError</code> until a
            <code className="font-mono">browser_agent</code> verification pass updates them. Fixtures-mode
            scrapes are unaffected (they use static HTML).
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className={
            meta.tone === "warn"
              ? "gap-1 border-amber-500/50 bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300"
              : "gap-1 border-emerald-500/50 bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"
          }
        >
          <VIcon className="size-3.5" aria-hidden="true" />
          verified_by: {meta.label}
        </Badge>
        <Badge variant="outline" className="gap-1 px-2 py-1 text-xs font-medium">
          <CheckCircle2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
          last_verified: {selectors.last_verified}
        </Badge>
      </div>
      {selectors._verification_note && (
        <p className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs italic leading-relaxed text-muted-foreground">
          {selectors._verification_note}
        </p>
      )}
    </div>
  );
}

export function ConfigSection({ refreshKey }: ConfigSectionProps) {
  const [listings, setListings] = React.useState<ListingsConfig | null>(null);
  const [selectors, setSelectors] = React.useState<SelectorsConfig | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch("/api/config/listings").then(async (r) => {
        if (!r.ok) throw new Error(`listings HTTP ${r.status}`);
        return r.json() as Promise<ListingsConfig>;
      }),
      fetch("/api/config/selectors").then(async (r) => {
        if (!r.ok) throw new Error(`selectors HTTP ${r.status}`);
        return r.json() as Promise<SelectorsConfig>;
      }),
    ])
      .then(([l, s]) => {
        if (cancelled) return;
        setListings(l);
        setSelectors(s);
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
  }, [refreshKey]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Couldn't load config"
        description={error}
      />
    );
  }

  const listingsJson = listings ? JSON.stringify(listings, null, 2) : "";
  const selectorsJson = selectors ? JSON.stringify(selectors, null, 2) : "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <Tabs defaultValue="selectors" className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="bg-muted/60">
            <TabsTrigger value="selectors" className="gap-1.5">
              <Settings2 className="size-3.5" aria-hidden="true" />
              selectors.json
            </TabsTrigger>
            <TabsTrigger value="listings" className="gap-1.5">
              <FileJson className="size-3.5" aria-hidden="true" />
              listings.json
            </TabsTrigger>
          </TabsList>
          <p className="text-xs text-muted-foreground">
            Read-only view · source:{" "}
            <code className="font-mono text-[11px]">
              /home/z/my-project/gbp-monitor/config/
            </code>
          </p>
        </div>

        <TabsContent value="selectors">
          <Card className="gbp-card-hover">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Settings2 className="size-4 text-primary" aria-hidden="true" />
                    config/selectors.json
                  </CardTitle>
                  <CardDescription>
                    CSS/XPath selectors used by the Playwright harness + parser.
                    High-risk file — Google Maps DOM changes break these without
                    warning (see Rule 6).
                  </CardDescription>
                </div>
                {selectors && <CopyButton text={selectorsJson} />}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectors && <SelectorsHeader selectors={selectors} />}
              <JsonHighlight value={selectorsJson} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="listings">
          <Card className="gbp-card-hover">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileJson className="size-4 text-primary" aria-hidden="true" />
                    config/listings.json
                  </CardTitle>
                  <CardDescription>
                    6 Copenhagen Bali branches × 2 competitors each = 12 listings.
                    Mock data for development — real competitor URLs are an M1
                    client data-entry blocker.
                  </CardDescription>
                </div>
                {listings && <CopyButton text={listingsJson} />}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {listings && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Branches
                    </div>
                    <div className="text-xl font-bold tabular-nums">
                      {listings.branches.length}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Competitors
                    </div>
                    <div className="text-xl font-bold tabular-nums">
                      {listings.branches.reduce(
                        (acc, b) => acc + b.competitors.length,
                        0,
                      )}
                    </div>
                  </div>
                  <div className="col-span-2 rounded-lg border border-border/60 bg-muted/30 p-3 sm:col-span-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Branch IDs
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {listings.branches.map((b) => (
                        <Badge
                          key={b.branch_id}
                          variant="outline"
                          className="font-mono text-[10px]"
                        >
                          {b.branch_id}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <JsonHighlight value={listingsJson} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
