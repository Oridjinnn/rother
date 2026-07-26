"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  Edit3,
  FileJson,
  Save,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  X,
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

import { EmptyState } from "./empty-state";
import type { ListingsConfig, SelectorsConfig, VerifiedBy } from "@/lib/gbp/types";

interface ConfigSectionProps {
  refreshKey?: number;
}

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

function tokenizeJson(json: string): string {
  const esc = json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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

function CopyBtn({ text }: { text: string }) {
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
          /* silent */
        }
      }}
      aria-label="Copy JSON to clipboard"
      className="h-7 text-xs"
    >
      {copied ? (
        <>
          <Check className="size-3 text-emerald-500" />
          Copied
        </>
      ) : (
        <>
          <Copy className="size-3" />
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
          <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400" />
          <AlertTitle className="text-amber-800 dark:text-amber-200">
            Selectors are UNPROVEN against live Google Maps DOM
          </AlertTitle>
          <AlertDescription className="text-amber-700/90 dark:text-amber-300/90">
            <code className="font-mono">verified_by</code> is{" "}
            <code className="font-mono font-semibold">"seed"</code>.
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
          <VIcon className="size-3.5" />
          verified_by: {meta.label}
        </Badge>
        <Badge variant="outline" className="gap-1 px-2 py-1 text-xs font-medium">
          <CheckCircle2 className="size-3.5 text-muted-foreground" />
          last_verified: {selectors.last_verified}
        </Badge>
      </div>
    </div>
  );
}

function EditableJsonCard({
  title,
  description,
  json,
  onSave,
}: {
  title: string;
  description: string;
  json: string;
  onSave: (value: string) => Promise<void>;
}) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(json);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setValue(json);
  }, [json]);

  const handleSave = async () => {
    setSaving(true);
    try {
      JSON.parse(value);
      await onSave(value);
      setEditing(false);
      toast.success("Configuration saved", { description: "Changes written to disk." });
    } catch (e) {
      toast.error("Invalid JSON", {
        description: e instanceof Error ? e.message : "Parse error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="gbp-card-hover">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileJson className="size-4 text-primary" />
              {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <CopyBtn text={value} />
            {editing ? (
              <>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSave}
                  disabled={saving}
                  className="gap-1.5 h-7 text-xs"
                >
                  <Save className="size-3" />
                  {saving ? "Saving..." : "Save"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setEditing(false); setValue(json); }}
                  className="h-7 text-xs"
                  aria-label="Cancel editing"
                >
                  <X className="size-3" />
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(true)}
                className="gap-1.5 h-7 text-xs"
              >
                <Edit3 className="size-3" />
                Edit
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {editing ? (
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="min-h-[400px] font-mono text-xs"
            aria-label="Edit JSON configuration"
          />
        ) : (
          <JsonHighlight value={value} />
        )}
      </CardContent>
    </Card>
  );
}

export function ConfigSection({ refreshKey }: ConfigSectionProps) {
  const [listings, setListings] = React.useState<ListingsConfig | null>(null);
  const [selectors, setSelectors] = React.useState<SelectorsConfig | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchConfig = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [l, s] = await Promise.all([
        fetch("/api/config/listings").then(async (r) => {
          if (!r.ok) throw new Error(`listings HTTP ${r.status}`);
          return r.json() as Promise<ListingsConfig>;
        }),
        fetch("/api/config/selectors").then(async (r) => {
          if (!r.ok) throw new Error(`selectors HTTP ${r.status}`);
          return r.json() as Promise<SelectorsConfig>;
        }),
      ]);
      setListings(l);
      setSelectors(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchConfig();
  }, [fetchConfig, refreshKey]);

  const handleSaveListings = async (value: string) => {
    const parsed = JSON.parse(value);
    const res = await fetch("/api/config/listings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    setListings(parsed);
  };

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
      <Tabs defaultValue="listings" className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="bg-muted/60">
            <TabsTrigger value="listings" className="gap-1.5">
              <FileJson className="size-3.5" />
              listings.json
            </TabsTrigger>
            <TabsTrigger value="selectors" className="gap-1.5">
              <Settings2 className="size-3.5" />
              selectors.json
            </TabsTrigger>
          </TabsList>
          <p className="text-xs text-muted-foreground">
            {listings && (
              <span>
                {listings.branches.length} branches ·{" "}
                {listings.branches.reduce((a, b) => a + b.competitors.length, 0)} competitors
              </span>
            )}
          </p>
        </div>

        <TabsContent value="listings">
          {listings && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-4">
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
                  {listings.branches.reduce((acc, b) => acc + b.competitors.length, 0)}
                </div>
              </div>
              <div className="col-span-2 rounded-lg border border-border/60 bg-muted/30 p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Branch IDs
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {listings.branches.map((b) => (
                    <Badge key={b.branch_id} variant="outline" className="font-mono text-[10px]">
                      {b.branch_id}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
          <EditableJsonCard
            title="config/listings.json"
            description="Branches, competitors, and Google Maps URLs. Edit this to configure monitoring."
            json={listingsJson}
            onSave={handleSaveListings}
          />
        </TabsContent>

        <TabsContent value="selectors">
          <Card className="gbp-card-hover">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Settings2 className="size-4 text-primary" />
                    config/selectors.json
                  </CardTitle>
                  <CardDescription>
                    CSS/XPath selectors used by the Playwright harness + parser.
                  </CardDescription>
                </div>
                {selectors && <CopyBtn text={selectorsJson} />}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectors && <SelectorsHeader selectors={selectors} />}
              <JsonHighlight value={selectorsJson} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
