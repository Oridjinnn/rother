"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard render error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center">
      <div className="rounded-full bg-destructive/10 p-4">
        <AlertTriangle className="size-10 text-destructive" aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-bold text-foreground">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        The dashboard encountered an unexpected error. This has been logged.
        Try refreshing the page, or click the button below to retry.
      </p>
      {error.digest && (
        <p className="font-mono text-[10px] text-muted-foreground">
          Error ID: {error.digest}
        </p>
      )}
      <Button onClick={reset} variant="default" className="gap-2">
        <RefreshCw className="size-4" />
        Try again
      </Button>
    </div>
  );
}
