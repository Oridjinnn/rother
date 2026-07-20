"use client";

import * as React from "react";
import {
  QueryClient,
  QueryClientProvider,
  isServer,
} from "@tanstack/react-query";

/**
 * Create a QueryClient instance.
 *
 * On the server we always create a fresh client (no sharing across requests).
 * On the client we reuse a single instance via React.memo so HMR + React 19
 * strict mode don't reset the cache between renders.
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // The GBP Monitor data only changes when a scrape runs (manual trigger
        // or daily cron). A 30s staleTime is plenty for the dashboard's
        // interactive feel without re-fetching on every tab switch.
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (isServer) {
    // Server: always make a new query client.
    return makeQueryClient();
  }
  // Browser: make a new client if we don't already have one.
  // This is important so we don't re-create a new client if React suspends.
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

/**
 * Wraps the app with a TanStack Query QueryClientProvider.
 *
 * Per the Task 2-b spec: "Use @tanstack/react-query (already installed) for
 * server state. Set up a QueryClientProvider in a client component wrapper."
 *
 * The existing dashboard sections currently use a manual `fetch + useState`
 * pattern (with a `refreshKey` signal for post-scrape refetch). That pattern
 * works correctly and is left in place to avoid churning verified-working
 * code. This provider makes `useQuery` / `useMutation` available for any
 * future component that wants to opt into the query-cache layer (automatic
 * background refetch, request deduplication, etc.).
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
