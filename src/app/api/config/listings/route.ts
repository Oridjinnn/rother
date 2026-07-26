import { NextResponse } from "next/server";

import { sanitizeError } from "@/lib/gbp/sanitize";
import { readListings } from "@/lib/gbp/server-data";
import { GBP_LISTINGS_PATH } from "@/lib/gbp/paths";
import { promises as fs } from "node:fs";
import type { BranchConfig } from "@/lib/gbp/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface ValidationError {
  field: string;
  message: string;
}

function validateBranchConfig(data: unknown): {
  valid: false; errors: ValidationError[]
} | {
  valid: true; branches: BranchConfig[]
} {
  if (!data || typeof data !== "object") {
    return { valid: false, errors: [{ field: "body", message: "Request body must be a JSON object" }] };
  }

  const body = data as Record<string, unknown>;
  if (!body.branches || !Array.isArray(body.branches)) {
    return { valid: false, errors: [{ field: "branches", message: "branches must be an array" }] };
  }

  const errors: ValidationError[] = [];
  const seenBranchIds = new Set<string>();
  const seenCompKeys = new Set<string>();

  for (let i = 0; i < body.branches.length; i++) {
    const b = body.branches[i];
    const prefix = `branches[${i}]`;

    if (!b || typeof b !== "object") {
      errors.push({ field: prefix, message: "branch must be an object" });
      continue;
    }

    const branch = b as Record<string, unknown>;

    if (!branch.branch_id || typeof branch.branch_id !== "string" || !branch.branch_id.trim()) {
      errors.push({ field: `${prefix}.branch_id`, message: "branch_id is required and must be a non-empty string" });
    } else if (seenBranchIds.has(branch.branch_id)) {
      errors.push({ field: `${prefix}.branch_id`, message: `duplicate branch_id: "${branch.branch_id}"` });
    } else {
      seenBranchIds.add(branch.branch_id as string);
    }

    if (!branch.branch_name || typeof branch.branch_name !== "string" || !branch.branch_name.trim()) {
      errors.push({ field: `${prefix}.branch_name`, message: "branch_name is required and must be a non-empty string" });
    }

    if (!branch.competitors || !Array.isArray(branch.competitors)) {
      errors.push({ field: `${prefix}.competitors`, message: "competitors must be an array" });
    } else {
      for (let j = 0; j < branch.competitors.length; j++) {
        const c = branch.competitors[j];
        const cp = `${prefix}.competitors[${j}]`;

        if (!c || typeof c !== "object") {
          errors.push({ field: cp, message: "competitor must be an object" });
          continue;
        }

        const comp = c as Record<string, unknown>;

        if (!comp.competitor_id || typeof comp.competitor_id !== "string" || !comp.competitor_id.trim()) {
          errors.push({ field: `${cp}.competitor_id`, message: "competitor_id is required and must be a non-empty string" });
        }

        if (!comp.name || typeof comp.name !== "string" || !comp.name.trim()) {
          errors.push({ field: `${cp}.name`, message: "name is required and must be a non-empty string" });
        }

        if (!comp.gmaps_url || typeof comp.gmaps_url !== "string" || !comp.gmaps_url.trim()) {
          errors.push({ field: `${cp}.gmaps_url`, message: "gmaps_url is required and must be a non-empty string" });
        }

        const key = `${branch.branch_id}:${comp.competitor_id}`;
        if (seenCompKeys.has(key)) {
          errors.push({ field: `${cp}.competitor_id`, message: `duplicate competitor_id "${comp.competitor_id}" in branch "${branch.branch_id}"` });
        } else {
          seenCompKeys.add(key);
        }
      }
    }
  }

  if (errors.length > 0) return { valid: false, errors };

  const branches = body.branches.map((b) => {
    const branch = b as Record<string, unknown>;
    return {
      branch_id: branch.branch_id as string,
      branch_name: branch.branch_name as string,
      competitors: (branch.competitors as Record<string, unknown>[]).map((c) => ({
        competitor_id: c.competitor_id as string,
        name: c.name as string,
        gmaps_url: c.gmaps_url as string,
      })),
    };
  });

  return { valid: true, branches };
}

export async function GET() {
  const listings = await readListings();
  return NextResponse.json(listings, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PATCH(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "config update failed", detail: "Invalid JSON in request body" },
        { status: 400 },
      );
    }

    const validation = validateBranchConfig(body);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "validation failed", detail: validation.errors.map((e) => `${e.field}: ${e.message}`).join("; ") },
        { status: 422 },
      );
    }

    if (validation.branches.length === 0) {
      return NextResponse.json(
        { error: "validation failed", detail: "branches array cannot be empty — would delete all configuration" },
        { status: 422 },
      );
    }

    const current = await readListings();
    current.branches = validation.branches;

    await fs.writeFile(
      GBP_LISTINGS_PATH,
      JSON.stringify(current, null, 2),
      "utf-8",
    );

    return NextResponse.json({ ok: true, listings: current });
  } catch (err) {
    return NextResponse.json(
      {
        error: "config update failed",
        detail: sanitizeError(err),
      },
      { status: 500 },
    );
  }
}
