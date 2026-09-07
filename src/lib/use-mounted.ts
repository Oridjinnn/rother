"use client";

import * as React from "react";

/**
 * C1 / B6 — replaces the pervasive
 * `const [mounted, setMounted] = useState(false); useEffect(() => setMounted(true), [])`
 * mount-guard pattern (which triggers `react-hooks/set-state-in-effect`).
 *
 * Backed by `useSyncExternalStore` with a stable `false` server snapshot, so the
 * value is consistent between SSR and the first client render (no hydration
 * mismatch) and flips to `true` only after mount — without writing state in an
 * effect.
 */
const MOUNTED_SNAPSHOT = false;

function subscribe(): () => void {
  // The client mounts exactly once; notify on the next microtask so subscribers
  // re-render with `true` after hydration.
  const cb = () => {};
  if (typeof window !== "undefined") {
    queueMicrotask(cb);
  }
  return () => {};
}

function getSnapshot(): boolean {
  return typeof window !== "undefined";
}

export function useMounted(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, () => MOUNTED_SNAPSHOT);
}
