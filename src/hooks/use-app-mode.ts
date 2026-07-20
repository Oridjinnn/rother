"use client";

import * as React from "react";

import { readModeFromUrl, getText, type AppMode, type TextMap } from "@/lib/app-mode";

/**
 * Hook that reads the current app mode from the URL (`?mode=dev`).
 * Returns the mode + the full text map for that mode.
 *
 * Listens for `popstate` + `pushstate` events so the mode updates if the
 * user navigates between `/?mode=client` and `/?mode=dev`.
 */
export function useAppMode(): { mode: AppMode; T: TextMap } {
  // Initialize as null — the mode is read from window.location which is only
  // available on the client. During SSR, we default to "client" mode.
  // After mount, the effect reads the actual mode from the URL.
  const [mode, setMode] = React.useState<AppMode | null>(null);

  React.useEffect(() => {
    const update = () => setMode(readModeFromUrl());
    update(); // sync on mount — reads the actual URL (?mode=dev or default)
    window.addEventListener("popstate", update);
    // Also listen for pushstate (when we programmatically change the URL)
    const origPush = window.history.pushState;
    window.history.pushState = function (...args) {
      const ret = origPush.apply(this, args);
      update();
      return ret;
    };
    return () => {
      window.removeEventListener("popstate", update);
      window.history.pushState = origPush;
    };
  }, []);

  // During SSR (mode === null), use "client" as the default to match the
  // server's rendering. After mount, use the actual mode from the URL.
  const effectiveMode = mode ?? "client";
  const T = React.useMemo(() => getText(effectiveMode), [effectiveMode]);
  return { mode: effectiveMode, T };
}

/** Navigate to the given mode by updating the URL query parameter. */
export function switchMode(mode: AppMode) {
  const url = new URL(window.location.href);
  if (mode === "dev") {
    url.searchParams.set("mode", "dev");
  } else {
    url.searchParams.delete("mode");
  }
  window.history.pushState({}, "", url.toString());
  // Dispatch a popstate event so listeners update
  window.dispatchEvent(new PopStateEvent("popstate"));
}
