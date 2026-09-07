/**
 * App mode system — switches between "Rother (Client)" and "Rother (Dev)".
 *
 * The mode is controlled by the `?mode=dev` URL query parameter:
 *   - `/`           → Client mode (default) — clean, no dev jargon, no Run Logs/Config tabs
 *   - `/?mode=dev`  → Dev mode — full developer view with Run Logs + Config tabs
 *
 * The `T` object maps developer terms to client-friendly terms based on the
 * active mode. Components use `T.xxx` instead of hardcoded developer strings.
 */

export type AppMode = "client" | "dev";

/** Read the mode from the URL query parameter. Default = "client". */
export function readModeFromUrl(): AppMode {
  if (typeof window === "undefined") return "client";
  const params = new URLSearchParams(window.location.search);
  return params.get("mode") === "dev" ? "dev" : "client";
}

/** The app name shown in the header/footer. */
export function appName(mode: AppMode): string {
  return mode === "dev" ? "Rother (Dev)" : "Rother";
}

/** The version string. */
export function appVersion(): string {
  return "0.2.0";
}

/**
 * Text mappings — all user-facing strings that differ between modes.
 * In Client mode, developer jargon (scrape, scraper, run, LLM, AI,
 * fixtures, selectors, etc.) is replaced with client-friendly language
 * (update, sync, collect, data source, etc.).
 */
export type TextMap = {
  /** "Rother" or "Rother (Dev)" */
  name: string;
  /** Header subtitle */
  subtitle: string;
  /** "0.0.1" */
  version: string;
  /** Footer tagline — client mode removes "Zero-cost · No AI/LLM" */
  tagline: string;
  /** "Update Now" (client) / "Run Now" (dev) */
  runButton: string;
  /** "Updating…" (client) / "Running…" (dev) */
  runButtonLoading: string;
  /** aria-label for the run button */
  runButtonAria: string;
  /** Toast: "Updating data…" (client) / "Running scraper (fixtures mode)…" (dev) */
  runToastLoading: string;
  /** Toast: "Update complete" (client) / "Scrape complete" (dev) */
  runToastSuccess: string;
  /** Toast description during run */
  runToastDesc: string;
  /** "Last updated" (client) / "Last run" (dev) — KPI card label */
  lastRunLabel: string;
  /** "Update Health" (client) / "Last Run Health" (dev) */
  healthPanelTitle: string;
  /** "Update Now" tooltip shortcut (client) / "Run scraper now (fixtures mode)" (dev) */
  runTooltipTitle: string;
  /** "Update Schedule" (client) / "Scrape Schedule" (dev) */
  scheduleTitle: string;
  /** "Automatic daily updates" (client) / "GitHub Actions cron — runs automatically every day." (dev) */
  scheduleDesc: string;
  /** "next update" (client) / "next scheduled run" (dev) */
  scheduleNextLabel: string;
  /** "Update History" (client) / "Run History" (dev) */
  historyTitle: string;
  /** "Update Comparison" (client) / "Run Comparison" (dev) */
  comparisonTitle: string;
  /** "last updated" (client) / "last scraped" (dev) — freshness/labels */
  lastUpdatedLabel: string;
  /** "data collection" (client) / "scraper" (dev) */
  collectorNoun: string;
  /** "updated" (client) / "scraped" (dev) — past tense */
  collectedPast: string;
  /** "collecting" (client) / "scraping" (dev) — present participle */
  collectingPresent: string;
  /** Whether to show the Run Logs tab */
  showRunLogsTab: boolean;
  /** Whether to show the Config tab */
  showConfigTab: boolean;
  /** Whether to show the UNPROVEN selectors warning banner */
  showUnprovenBanner: boolean;
  /** Whether to show "No AI/LLM" disclaimers on charts */
  showNoAiDisclaimers: boolean;
  /** Whether to show the "GitHub Actions cron" link in the footer */
  showCronLink: boolean;
  /** Whether to show developer-facing descriptions (file paths, technical details) */
  showTechnicalDetails: boolean;
};

/** Get the text map for the given mode. */
export function getText(mode: AppMode): TextMap {
  if (mode === "dev") {
    return {
      name: "Rother (Dev)",
      subtitle: "Competitor review insights",
      version: "0.2.0",
      tagline: "Zero-cost · No AI/LLM",
      runButton: "Run Now",
      runButtonLoading: "Running…",
      runButtonAria: "Run scraper now (fixtures mode)",
      runToastLoading: "Running scraper (fixtures mode)…",
      runToastSuccess: "Scrape complete",
      runToastDesc: "This may take a few minutes",
      lastRunLabel: "Last Run",
      healthPanelTitle: "Last Run Health",
      runTooltipTitle: "Run scraper now (fixtures mode)",
      scheduleTitle: "Scrape Schedule",
      scheduleDesc: "GitHub Actions cron — runs automatically every day.",
      scheduleNextLabel: "Next scheduled run in",
      historyTitle: "Run History",
      comparisonTitle: "Run Comparison",
      lastUpdatedLabel: "last scraped",
      collectorNoun: "scraper",
      collectedPast: "scraped",
      collectingPresent: "scraping",
      showRunLogsTab: true,
      showConfigTab: true,
      showUnprovenBanner: true,
      showNoAiDisclaimers: true,
      showCronLink: true,
      showTechnicalDetails: true,
    };
  }
  // Client mode — clean, professional, no dev jargon
  return {
    name: "Rother",
    subtitle: "Competitor review insights",
    version: "0.2.0",
    tagline: "Automated review monitoring",
    runButton: "Update Now",
    runButtonLoading: "Updating…",
    runButtonAria: "Update data now",
    runToastLoading: "Updating data…",
    runToastSuccess: "Update complete",
    runToastDesc: "Refreshing the latest review data",
    lastRunLabel: "Last Updated",
    healthPanelTitle: "Update Status",
    runTooltipTitle: "Update data now",
    scheduleTitle: "Update Schedule",
    scheduleDesc: "Automatic daily updates — data refreshes every morning.",
    scheduleNextLabel: "Next update in",
    historyTitle: "Update History",
    comparisonTitle: "Update Comparison",
    lastUpdatedLabel: "last updated",
    collectorNoun: "data collection",
    collectedPast: "updated",
    collectingPresent: "updating",
    showRunLogsTab: false,
    showConfigTab: false,
    showUnprovenBanner: false,
    showNoAiDisclaimers: false,
    showCronLink: false,
    showTechnicalDetails: false,
  };
}
