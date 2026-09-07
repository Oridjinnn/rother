"use client";

import * as React from "react";
import { Loader2, MapPin } from "lucide-react";

import { Input } from "@/components/ui/input";
import { fetchPlaces, manualPlace, type Place } from "@/lib/places";

interface AutocompleteInputProps {
  label?: string;
  icon?: React.ReactNode;
  hint?: string;
  placeholder?: string;
  biasLat?: number;
  biasLng?: number;
  onSelect: (place: Place) => void;
  /** Offer a "use this text as-is" option when providers return nothing. */
  allowManual?: boolean;
  autoFocus?: boolean;
}

export function AutocompleteInput({
  label,
  icon,
  hint,
  placeholder,
  biasLat,
  biasLng,
  onSelect,
  allowManual = true,
  autoFocus,
}: AutocompleteInputProps) {
  const [text, setText] = React.useState("");
  const [results, setResults] = React.useState<Place[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const q = text.trim();
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      void (async () => {
        try {
          const places = await fetchPlaces(q, { lat: biasLat, lng: biasLng, signal: ctrl.signal });
          if (!ctrl.signal.aborted) {
            setResults(places);
            setActive(-1);
            setOpen(true);
          }
        } catch {
          if (!ctrl.signal.aborted) setResults([]);
        } finally {
          if (!ctrl.signal.aborted) setLoading(false);
        }
      })();
    }, 250);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [text, biasLat, biasLng]);

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const choose = (p: Place) => {
    onSelect(p);
    setText(p.name ?? p.formatted_address);
    setOpen(false);
    setResults([]);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && results[active]) choose(results[active]);
      else if (allowManual && text.trim()) choose(manualPlace(text.trim()));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="block space-y-1.5">
      {label && (
        <span className="flex items-center gap-2 text-sm font-medium">
          {icon && <span className="text-primary">{icon}</span>}
          {label}
        </span>
      )}
      <div ref={ref} className="relative">
        <div className="relative">
          {icon ? (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {icon}
            </span>
          ) : null}
          <Input
            value={text}
            onChange={(e) => {
              const v = e.target.value;
              setText(v);
              if (v.trim().length < 2) {
                setResults([]);
                setOpen(false);
                setLoading(false);
              }
            }}
            onKeyDown={onKeyDown}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder={placeholder}
            autoFocus={autoFocus}
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            className={icon ? "pl-9" : ""}
          />
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
        {open && (results.length > 0 || (allowManual && text.trim())) && (
          <ul className="absolute z-50 mt-2 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
            {results.map((p, i) => (
              <li key={p.place_id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(p)}
                  className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted ${
                    i === active ? "bg-muted" : ""
                  }`}
                >
                  <span className="truncate font-medium">{p.name ?? p.formatted_address}</span>
                  <span className="truncate text-xs text-muted-foreground">{p.formatted_address}</span>
                </button>
              </li>
            ))}
            {allowManual && results.length === 0 && text.trim() && (
              <li>
                <button
                  type="button"
                  onClick={() => choose(manualPlace(text.trim()))}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <MapPin className="size-4 shrink-0" />
                  Use &ldquo;{text.trim()}&rdquo; as-is
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function AddressAutocomplete(props: Omit<AutocompleteInputProps, "label">) {
  return <AutocompleteInput {...props} placeholder={props.placeholder ?? "Start typing an address…"} />;
}
