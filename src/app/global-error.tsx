"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function GlobalError({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-8 text-center">
        <div className="rounded-full bg-destructive/10 p-4">
          <AlertTriangle className="size-10 text-destructive" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">
          Critical application error
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Rother encountered a critical error and could not recover.
          Please reload the page. If the problem persists, contact support.
        </p>
        <Button onClick={reset} variant="default" className="gap-2">
          <RefreshCw className="size-4" />
          Reload page
        </Button>
      </body>
    </html>
  );
}
