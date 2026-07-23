import { NextResponse } from "next/server";

import { readSelectors } from "@/lib/gbp/server-data";
import type { SelectorsConfig } from "@/lib/gbp/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** GET /api/config/selectors — selectors.json with metadata and health.

 * Returns the full selectors config (including _meta section with
 * descriptions, selector types, and fallback notes) alongside a
 * computed health overview:
 *
 *   {
 *     "_meta": {...},
 *     "cookie_reject_button": [...],
 *     ...
 *     "_health": {
 *       "total_selectors": 11,
 *       "selectors_with_fallbacks": 4,
 *       "selectors_single": 7,
 *       "last_verified": null,
 *       "verification_note": "..."
 *     }
 *   }
 */
export async function GET() {
  const selectors = await readSelectors();
  if (!selectors) {
    return NextResponse.json({ error: "selectors.json not found" }, { status: 404 });
  }

  const meta = (selectors as SelectorsConfig)._meta;
  const selectorKeys = meta
    ? Object.keys(meta.descriptions ?? {})
    : Object.keys(selectors).filter(
        (k) => !k.startsWith("_") && k !== "last_verified" && k !== "verified_by",
      );

  let withFallbacks = 0;
  for (const key of selectorKeys) {
    const val = (selectors as Record<string, unknown>)[key];
    if (Array.isArray(val) && val.length > 1) {
      withFallbacks += 1;
    }
  }

  return NextResponse.json(
    {
      ...selectors,
      _health: {
        total_selectors: selectorKeys.length,
        selectors_with_fallbacks: withFallbacks,
        selectors_single: selectorKeys.length - withFallbacks,
        last_verified: selectors.last_verified ?? meta?.last_verified ?? null,
        verified_by: selectors.verified_by ?? meta?.verified_by ?? null,
        verification_note: selectors._verification_note ?? null,
      },
    },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}
