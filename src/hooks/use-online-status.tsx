"use client";

import * as React from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface OnlineStatusContextValue {
  isOnline: boolean;
}

const OnlineStatusContext = React.createContext<OnlineStatusContextValue>({
  isOnline: true,
});

export function useOnlineStatus() {
  return React.useContext(OnlineStatusContext);
}

/**
 * C1 / B6 — `isOnline` is external (browser) state. Backed by
 * `useSyncExternalStore` so the initial value is read synchronously from
 * `navigator.onLine` (server snapshot = true to avoid hydration mismatch)
 * instead of being written in an effect. The toast / cache-invalidation side
 * effects live in a separate effect that reacts to changes.
 */
function subscribeOnline(cb: () => void): () => void {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

function getOnlineSnapshot(): boolean {
  return navigator.onLine;
}

function getServerOnlineSnapshot(): boolean {
  return true;
}

export function OnlineStatusProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const isOnline = React.useSyncExternalStore(
    subscribeOnline,
    getOnlineSnapshot,
    getServerOnlineSnapshot,
  );
  const wasOffline = React.useRef(false);
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (!isOnline) {
      wasOffline.current = true;
      toast.error("You are offline", {
        description: "Dashboard data may be stale until connection resumes.",
        duration: Infinity,
        id: "offline-toast",
      });
    } else if (wasOffline.current) {
      wasOffline.current = false;
      toast.success("Back online", {
        description: "Refreshing data...",
        duration: 4000,
      });
      queryClient.invalidateQueries();
    }
  }, [isOnline, queryClient]);

  return (
    <OnlineStatusContext.Provider value={{ isOnline }}>
      {children}
    </OnlineStatusContext.Provider>
  );
}
