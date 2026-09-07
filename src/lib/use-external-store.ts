"use client";

import * as React from "react";

/**
 * B6 / C1 — external-store subscriptions without the hydration flash.
 *
 * The 25 `react-hooks/set-state-in-effect` directives in the codebase exist
 * because components read `localStorage` / `navigator.onLine` inside a
 * `useEffect` and then `setState`, producing a brief empty render before the
 * effect runs (and a potential SSR hydration mismatch). React's official tool
 * for subscribing to an external mutable store is `useSyncExternalStore`, whose
 * `getServerSnapshot` gives the server and the first client render the same
 * value — eliminating both the flash and the mismatch.
 *
 * `getSnapshot` must return a *stable* reference when the underlying value is
 * unchanged, otherwise React re-renders infinitely. We memoize the parsed value
 * keyed by the raw storage string (see `readValue`).
 */

const LOCAL_STORAGE_EVENT = "rother:local-storage";

const _snapshotCache = new Map<string, { raw: string | null; value: unknown }>();

function readValue<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return fallback;
  }
  const cached = _snapshotCache.get(key);
  if (cached && cached.raw === raw) return cached.value as T;
  let value: T = fallback;
  if (raw !== null) {
    try {
      value = JSON.parse(raw) as T;
    } catch {
      value = fallback;
    }
  }
  _snapshotCache.set(key, { raw, value });
  return value;
}

function subscribeToLocalStorage(key: string, cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === key) cb();
  };
  const onCustom = () => cb();
  window.addEventListener("storage", onStorage);
  window.addEventListener(LOCAL_STORAGE_EVENT, onCustom);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(LOCAL_STORAGE_EVENT, onCustom);
  };
}

/**
 * localStorage-backed state via `useSyncExternalStore`.
 *
 * `getServerSnapshot` returns `fallback` so SSR and the first client render
 * agree; the real value is read on the client after hydration. Cross-tab and
 * same-tab writes are observed via the `storage` event and a custom event.
 */
export function useLocalStorageState<T>(
  key: string,
  fallback: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const subscribe = React.useCallback(
    (cb: () => void) => subscribeToLocalStorage(key, cb),
    [key],
  );
  const getSnapshot = React.useCallback(
    () => readValue<T>(key, fallback),
    [key, fallback],
  );
  const getServerSnapshot = React.useCallback(() => fallback, [fallback]);

  const value = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setValue = React.useCallback(
    (next: T | ((prev: T) => T)) => {
      const current = readValue<T>(key, fallback);
      const resolved =
        typeof next === "function" ? (next as (prev: T) => T)(current) : next;
      try {
        const serialized = JSON.stringify(resolved);
        window.localStorage.setItem(key, serialized);
        _snapshotCache.set(key, { raw: serialized, value: resolved });
        window.dispatchEvent(new Event(LOCAL_STORAGE_EVENT));
      } catch {
        // Ignore quota / private-mode errors.
      }
    },
    [key, fallback],
  );

  return [value, setValue];
}
