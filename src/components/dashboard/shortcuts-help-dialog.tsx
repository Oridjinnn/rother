"use client";

import * as React from "react";
import { Keyboard, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ShortcutsHelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Shortcut {
  keys: string[];
  description: string;
}

const SHORTCUT_GROUPS: { title: string; shortcuts: Shortcut[] }[] = [
  {
    title: "Actions",
    shortcuts: [
      { keys: ["g", "r"], description: "Run scraper now (fixtures mode)" },
      { keys: ["?"], description: "Open this shortcuts help" },
      { keys: ["Esc"], description: "Close dialogs / help" },
    ],
  },
  {
    title: "Tab navigation",
    shortcuts: [
      { keys: ["g", "o"], description: "Go to Overview tab" },
      { keys: ["g", "b"], description: "Go to Branches tab" },
      { keys: ["g", "v"], description: "Go to Reviews tab" },
      { keys: ["g", "l"], description: "Go to Run Logs tab" },
      { keys: ["g", "c"], description: "Go to Config tab" },
    ],
  },
];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-7 items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground shadow-sm">
      {children}
    </kbd>
  );
}

/**
 * Modal dialog showing all available keyboard shortcuts. Opens via the "?"
 * key (or Shift+/) and closes via Escape or clicking outside.
 */
export function ShortcutsHelpDialog({
  open,
  onOpenChange,
}: ShortcutsHelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Keyboard className="size-4 text-primary" aria-hidden="true" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Gmail-style two-key sequences. Press the first key, then the second
            within 800ms. Shortcuts are disabled while typing in inputs.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto gbp-scrollbar px-5 py-4">
          {SHORTCUT_GROUPS.map((group, gi) => (
            <div key={group.title} className={gi > 0 ? "mt-5" : ""}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.title}
              </h3>
              <ul className="space-y-1.5">
                {group.shortcuts.map((s, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted/40"
                  >
                    <span className="text-sm text-foreground/90">
                      {s.description}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {s.keys.map((k, j) => (
                        <React.Fragment key={j}>
                          {j > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              then
                            </span>
                          )}
                          <Kbd>{k}</Kbd>
                        </React.Fragment>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-border/60 px-5 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="w-full gap-1.5"
          >
            <X className="size-3.5" aria-hidden="true" />
            Close
            <span className="ml-2 text-[10px] text-muted-foreground">
              <Kbd>Esc</Kbd>
            </span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
