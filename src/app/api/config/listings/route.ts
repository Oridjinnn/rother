import { NextResponse } from "next/server";

import { readListings } from "@/lib/gbp/server-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** GET /api/config/listings — raw listings.json (read-only). */
export async function GET() {
  const listings = await readListings();
  return NextResponse.json(listings, {
    headers: { "Cache-Control": "no-store" },
  });
}
