"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

interface CopyButtonProps {
  /** The text to copy to the clipboard. */
  value: string;
  /** Accessible label for the button. */
  label?: string;
  /** Optional tooltip/text to show next to the icon. If omitted, icon-only. */
  showText?: boolean;
  /** Display text (defaults to `value`). */
  displayText?: string;
  /** Size variant. */
  size?: "sm" | "md";
  /** Extra classes. */
  className?: string;
}

/**
 * A compact copy-to-clipboard button. Shows a Copy icon that flips to a
 * green Check for 1.5s after a successful copy, with a sonner toast.
 *
 * Uses the async Clipboard API (`navigator.clipboard.writeText`) with a
 * fallback to a hidden textarea + execCommand for older browsers / insecure
 * contexts (e.g. http://localhost without HTTPS).
 */
export function CopyButton({
  value,
  label = "Copy to clipboard",
  showText = false,
  displayText,
  size = "sm",
  className,
}: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const text = String(value ?? "");
    if (!text) return;
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        ok = true;
      } else {
        // Fallback for non-secure contexts (http://localhost without HTTPS)
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ok = document.execCommand("copy");
        ta.remove();
      }
    } catch {
      ok = false;
    }
    if (ok) {
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
      toast.success("Copied to clipboard", {
        description: text.length > 60 ? text.slice(0, 57) + "…" : text,
        duration: 2000,
      });
    } else {
      toast.error("Couldn't copy", {
        description: "Clipboard access failed — select the text manually.",
        duration: 3000,
      });
    }
  };

  const iconClass = size === "sm" ? "size-3" : "size-4";
  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center gap-1 rounded font-mono transition-colors",
        "text-muted-foreground hover:text-foreground hover:bg-muted/60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        size === "sm" ? "px-1 py-0.5 text-[10px]" : "px-1.5 py-1 text-xs",
        copied && "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10",
        className,
      )}
    >
      {copied ? (
        <Check className={iconClass} aria-hidden="true" />
      ) : (
        <Copy className={iconClass} aria-hidden="true" />
      )}
      {showText && (
        <span>{displayText ?? value}</span>
      )}
    </button>
  );
}
