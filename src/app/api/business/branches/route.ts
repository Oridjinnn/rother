import { NextResponse } from "next/server";

import type { BranchConfig } from "@/lib/gbp/types";
import {
  readActiveBusinessBranches,
  writeActiveBusinessBranches,
} from "@/lib/gbp/server-data";
import { sanitizeError } from "@/lib/gbp/sanitize";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * P2 / tenant scoping — manage the active business's OWN monitored branches
 * (the competitor set that is scraped and shown in the dashboard). This is
 * what separates "hide demo" from "scope to tenant": the seed `listings.json`
 * is never mutated; the user's config lives on `user-business.json`.
 */

export async function GET() {
  const branches = await readActiveBusinessBranches();
  return NextResponse.json(
    { branches },
    { headers: { "Cache-Control": "no-store" } },
  );
}

interface BranchesBody {
  branches?: BranchConfig[];
}

export async function POST(request: Request) {
  let body: BranchesBody;
  try {
    body = (await request.json()) as BranchesBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.branches)) {
    return NextResponse.json(
      { error: "branches must be an array" },
      { status: 400 },
    );
  }

  try {
    const updated = await writeActiveBusinessBranches(body.branches);
    return NextResponse.json(
      { ok: true, branches: updated.branches },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err) },
      { status: 500 },
    );
  }
}
