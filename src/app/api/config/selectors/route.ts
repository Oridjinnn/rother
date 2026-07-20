import { NextResponse } from "next/server";

import { readSelectors } from "@/lib/gbp/server-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** GET /api/config/selectors — raw selectors.json (read-only). */
export async function GET() {
  const selectors = await readSelectors();
  if (!selectors) {
    return NextResponse.json({ error: "selectors.json not found" }, { status: 404 });
  }
  return NextResponse.json(selectors, {
    headers: { "Cache-Control": "no-store" },
  });
}
