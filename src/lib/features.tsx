import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Bell,
  CalendarClock,
  Cloud,
  Columns3,
  Download,
  GitCompare,
  Gauge,
  History,
  Languages,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  Network,
  Radar,
  RefreshCw,
  Ruler,
  ScrollText,
  Settings2,
  Star,
  Store,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";

import type { HubId } from "@/lib/app-state";

export type HubDef = {
  id: HubId;
  label: string;
  description: string;
  icon: LucideIcon;
};

export type FeatureDef = {
  id: string;
  label: string;
  hub: HubId;
  description: string;
  keywords: string[];
  icon: LucideIcon;
  load: () => Promise<{ default: ComponentType }>;
};

export const HUBS: HubDef[] = [
  {
    id: "insights",
    label: "Insights",
    description: "Your business health at a glance",
    icon: LayoutDashboard,
  },
  {
    id: "reputation",
    label: "Reputation",
    description: "Reviews, ratings and alerts",
    icon: Star,
  },
  {
    id: "competitors",
    label: "Competitors",
    description: "See how you stack up",
    icon: Users,
  },
  {
    id: "tools",
    label: "Tools",
    description: "Account, config and export",
    icon: Settings2,
  },
];

export const FEATURES: FeatureDef[] = [
  // ── Insights (business health) ───────────────────────────────────────────
  {
    id: "i-kpis",
    label: "KPIs",
    hub: "insights",
    description: "Branches, competitors, reviews, last run at a glance",
    keywords: ["kpi", "summary", "overview", "stats", "health"],
    icon: LayoutDashboard,
    load: () => import("@/features/i-kpis"),
  },
  {
    id: "i-run-health",
    label: "Run Health",
    hub: "insights",
    description: "Last scrape success / failed / skipped",
    keywords: ["health", "run", "scrape", "status", "errors"],
    icon: Activity,
    load: () => import("@/features/i-run-health"),
  },
  {
    id: "i-rating-distribution",
    label: "Rating Distribution",
    hub: "insights",
    description: "Star ratings across all monitored reviews (1★–5★)",
    keywords: ["rating", "stars", "distribution", "1-5"],
    icon: Star,
    load: () => import("@/features/i-rating-distribution"),
  },
  {
    id: "i-new-reviews-branch",
    label: "New Reviews per Branch",
    hub: "insights",
    description: "New reviews detected in the latest run, grouped by branch",
    keywords: ["new", "branch", "recent"],
    icon: MapPin,
    load: () => import("@/features/i-new-reviews-branch"),
  },
  {
    id: "i-run-comparison",
    label: "Run Comparison",
    hub: "insights",
    description: "Diff two runs side by side",
    keywords: ["compare", "runs", "diff"],
    icon: GitCompare,
    load: () => import("@/features/i-run-comparison"),
  },
  {
    id: "i-run-history",
    label: "Run History",
    hub: "insights",
    description: "Every run that produced new reviews",
    keywords: ["history", "timeline", "runs"],
    icon: History,
    load: () => import("@/features/i-run-history"),
  },

  // ── Reputation (reviews) ─────────────────────────────────────────────────
  {
    id: "r-reviews",
    label: "All Reviews",
    hub: "reputation",
    description: "Searchable, filterable, paginated reviews",
    keywords: ["review", "search", "filter", "list"],
    icon: MessageSquare,
    load: () => import("@/features/r-reviews"),
  },
  {
    id: "r-reviews-over-time",
    label: "Reviews over Time",
    hub: "reputation",
    description: "Review count trend over time",
    keywords: ["trend", "over time", "timeline"],
    icon: TrendingUp,
    load: () => import("@/features/r-reviews-over-time"),
  },
  {
    id: "r-review-lengths",
    label: "Review Lengths",
    hub: "reputation",
    description: "Review text length distribution",
    keywords: ["length", "words", "size"],
    icon: Ruler,
    load: () => import("@/features/r-review-lengths"),
  },
  {
    id: "r-word-cloud",
    label: "Review Word Cloud",
    hub: "reputation",
    description: "Most frequent words in reviews",
    keywords: ["word", "cloud", "keywords", "text"],
    icon: Cloud,
    load: () => import("@/features/r-word-cloud"),
  },
  {
    id: "r-language",
    label: "Review Language",
    hub: "reputation",
    description: "Language distribution of reviews",
    keywords: ["language", "locale"],
    icon: Languages,
    load: () => import("@/features/r-language"),
  },
  {
    id: "r-recency-heatmap",
    label: "Review Recency",
    hub: "reputation",
    description: "When reviews were posted",
    keywords: ["recency", "heatmap", "calendar"],
    icon: CalendarClock,
    load: () => import("@/features/r-recency-heatmap"),
  },
  {
    id: "r-top-reviewers",
    label: "Top Reviewers",
    hub: "reputation",
    description: "Most active reviewers",
    keywords: ["reviewer", "top", "authors"],
    icon: Users,
    load: () => import("@/features/r-top-reviewers"),
  },
  {
    id: "r-alerts",
    label: "Alerts",
    hub: "reputation",
    description: "System and review alerts",
    keywords: ["alert", "notification", "warning"],
    icon: Bell,
    load: () => import("@/features/r-alerts"),
  },

  // ── Competitors ──────────────────────────────────────────────────────────
  {
    id: "c-branches",
    label: "Branches & Competitors",
    hub: "competitors",
    description: "Per-branch competitor intelligence",
    keywords: ["branch", "location", "competitor", "outlet"],
    icon: Store,
    load: () => import("@/features/c-branches"),
  },
  {
    id: "c-compare",
    label: "Branch Comparison",
    hub: "competitors",
    description: "Side-by-side branch comparison",
    keywords: ["compare", "versus", "branches"],
    icon: Columns3,
    load: () => import("@/features/c-compare"),
  },
  {
    id: "c-leaderboard",
    label: "Leaderboard",
    hub: "competitors",
    description: "Ranked competitors by metric",
    keywords: ["leaderboard", "rank", "top"],
    icon: Trophy,
    load: () => import("@/features/c-leaderboard"),
  },
  {
    id: "c-comparison",
    label: "Competitor Comparison",
    hub: "competitors",
    description: "Normalized radar comparison (top 3)",
    keywords: ["radar", "comparison", "dimensions"],
    icon: Radar,
    load: () => import("@/features/c-comparison"),
  },
  {
    id: "c-growth-rate",
    label: "Growth Rate",
    hub: "competitors",
    description: "Reviews per day by competitor",
    keywords: ["growth", "velocity", "rate"],
    icon: Gauge,
    load: () => import("@/features/c-growth-rate"),
  },
  {
    id: "c-correlation",
    label: "Correlation",
    hub: "competitors",
    description: "Which competitor traits track with review volume",
    keywords: ["correlation", "regression", "drivers"],
    icon: Network,
    load: () => import("@/features/c-correlation"),
  },
  {
    id: "c-competitive-health",
    label: "Competitive Health",
    hub: "competitors",
    description: "Automatic OSM discovery fused with correlation + run health",
    keywords: ["health", "discovery", "osm", "density", "intelligence"],
    icon: Activity,
    load: () => import("@/features/c-competitive-health"),
  },
  {
    id: "c-discover",
    label: "Discover competitors",
    hub: "competitors",
    description: "Run a category scan to find and add new competitors",
    keywords: ["discover", "category", "scan", "find"],
    icon: Radar,
    load: () => import("@/features/c-discover"),
  },
  {
    id: "c-geo-grid",
    label: "Geo grid",
    hub: "competitors",
    description: "Map your branches and competitors on a competitive grid",
    keywords: ["geo", "map", "grid", "location"],
    icon: MapPin,
    load: () => import("@/features/c-geo-grid"),
  },
  {
    id: "c-rating-dist-comparison",
    label: "Rating Distribution Compare",
    hub: "competitors",
    description: "Rating distribution by competitor",
    keywords: ["rating", "distribution", "compare"],
    icon: BarChart3,
    load: () => import("@/features/c-rating-dist-comparison"),
  },

  // ── Tools ────────────────────────────────────────────────────────────────
  {
    id: "t-config",
    label: "Configuration",
    hub: "tools",
    description: "Manage monitored competitors and branches",
    keywords: ["config", "settings", "setup"],
    icon: Settings2,
    load: () => import("@/features/t-config"),
  },
  {
    id: "t-logs",
    label: "Run Logs",
    hub: "tools",
    description: "Live data collection history",
    keywords: ["logs", "history", "debug", "trace"],
    icon: ScrollText,
    load: () => import("@/features/t-logs"),
  },
  {
    id: "t-export",
    label: "Export Data",
    hub: "tools",
    description: "Download CSV or JSON exports",
    keywords: ["export", "csv", "json", "download"],
    icon: Download,
    load: () => import("@/features/t-export"),
  },
  {
    id: "t-scrape-schedule",
    label: "Scrape Schedule",
    hub: "tools",
    description: "Automated scrape schedule",
    keywords: ["schedule", "cron", "scrape", "automation"],
    icon: RefreshCw,
    load: () => import("@/features/t-scrape-schedule"),
  },
];

export function getHub(id: HubId): HubDef {
  const h = HUBS.find((x) => x.id === id);
  if (!h) throw new Error(`Unknown hub: ${id}`);
  return h;
}
