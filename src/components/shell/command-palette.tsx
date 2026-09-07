"use client";

import * as React from "react";
import { CornerDownLeft, Search } from "lucide-react";

import { FEATURES, HUBS } from "@/lib/features";
import { useAppState, type HubId } from "@/lib/app-state";
import { cn } from "@/lib/utils";

type Item =
  | { kind: "hub"; id: HubId; label: string; description: string; icon: React.ElementType; hub: HubId }
  | { kind: "feature"; id: string; label: string; description: string; icon: React.ElementType; hub: HubId };

function buildItems(): Item[] {
  const hubs: Item[] = HUBS.map((h) => ({
    kind: "hub",
    id: h.id,
    label: h.label,
    description: h.description,
    icon: h.icon,
    hub: h.id,
  }));
  const features: Item[] = FEATURES.map((f) => ({
    kind: "feature",
    id: f.id,
    label: f.label,
    description: f.description,
    icon: f.icon,
    hub: f.hub,
  }));
  return [...hubs, ...features];
}

const ITEMS = buildItems();

function score(item: Item, q: string): number {
  if (!q) return 1;
  const hay = `${item.label} ${item.description} ${item.hub}`.toLowerCase();
  if (hay.includes(q)) return 2;
  // keyword-ish partial match
  return q.split(/\s+/).every((tok) => hay.includes(tok)) ? 1 : 0;
}

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, openHub, openFeature } = useAppState();
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  // Global Cmd/Ctrl+K toggle.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(!paletteOpen);
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, setPaletteOpen]);

  React.useEffect(() => {
    if (paletteOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery("");
      setActive(0);
      // focus after paint
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [paletteOpen]);

  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return ITEMS.map((it) => ({ it, s: score(it, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.it);
  }, [query]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive((a) => Math.min(a, Math.max(0, results.length - 1)));
  }, [results.length]);

  const select = React.useCallback(
    (item: Item | undefined) => {
      if (!item) return;
      if (item.kind === "hub") openHub(item.id as HubId);
      else openFeature(item.id);
    },
    [openHub, openFeature],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      select(results[active]);
    }
  };

  if (!paletteOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12dvh]"
      onMouseDown={() => setPaletteOpen(false)}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="size-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search features…"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            aria-label="Search features"
          />
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="gbp-scrollbar max-h-[50dvh] overflow-y-auto p-2">
          {results.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No features match “{query}”.
            </p>
          )}
          {results.map((item, i) => {
            const Icon = item.icon;
            const hubLabel = HUBS.find((h) => h.id === item.hub)?.label ?? "";
            return (
              <button
                key={`${item.kind}:${item.id}`}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => select(item)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left",
                  i === active ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                )}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background text-foreground">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.description}
                  </span>
                </span>
                <span className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {item.kind === "hub" ? "Hub" : hubLabel}
                </span>
                {i === active && (
                  <CornerDownLeft className="size-4 shrink-0 text-muted-foreground" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
