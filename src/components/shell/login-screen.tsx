"use client";

import * as React from "react";
import { Mail, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAppState } from "@/lib/app-state";

/**
 * Login screen.
 *
 * Currently a mock Google ("Gmail") sign-in that stores a local user so the
 * rest of the onboarding flow can be built and demoed without backend auth.
 *
 * To wire real Google OAuth later, replace the handler below with a
 * NextAuth/Google sign-in (or Tauri `oauth` plugin on desktop) and pass the
 * returned profile into `login(...)`. The rest of the app only depends on the
 * `user` shape from `useAppState`.
 */
export function LoginScreen() {
  const { login } = useAppState();
  const [busy, setBusy] = React.useState(false);

  const handleGoogle = React.useCallback(() => {
    setBusy(true);
    // TODO: replace with real Google OAuth. Mock profile for now.
    setTimeout(() => {
      login({
        name: "Business Owner",
        email: "owner@gmail.com",
        avatar: "https://www.gstatic.com/images/branding/product/1x/googleg_32dp.png",
      });
    }, 450);
  }, [login]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            {/* Rother mark */}
            <svg viewBox="0 0 32 32" className="size-8" aria-hidden="true">
              <circle cx="16" cy="16" r="13" fill="currentColor" opacity="0.15" />
              <path
                d="M9 22V10h4.2c3 0 5 1.7 5 4.6 0 2.9-2 4.6-5 4.6H12V22h-3zm3.2-7.1h.9c1.3 0 2.1-.7 2.1-2s-.8-2-2.1-2h-.9v4zm8.1 7.1V10h3v12h-3z"
                fill="currentColor"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Rother</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Competitor review intelligence for your business.
          </p>
        </div>

        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={handleGoogle}
          disabled={busy}
        >
          <Mail className="size-4" />
          {busy ? "Signing in…" : "Sign in with Gmail"}
        </Button>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" />
          Your data stays on this device.
        </p>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        Demo build — Google sign-in is mocked for local preview.
      </p>
    </div>
  );
}
