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

export function OnlineStatusProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isOnline, setIsOnline] = React.useState(true);
  const wasOffline = React.useRef(false);
  const queryClient = useQueryClient();

  React.useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      if (wasOffline.current) {
        toast.success("Back online", {
          description: "Refreshing data...",
          duration: 4000,
        });
        queryClient.invalidateQueries();
      }
      wasOffline.current = false;
    }

    function handleOffline() {
      setIsOnline(false);
      wasOffline.current = true;
      toast.error("You are offline", {
        description: "Dashboard data may be stale until connection resumes.",
        duration: Infinity,
        id: "offline-toast",
      });
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsOnline(navigator.onLine);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <OnlineStatusContext.Provider value={{ isOnline }}>
      {children}
    </OnlineStatusContext.Provider>
  );
}
