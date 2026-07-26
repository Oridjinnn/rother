import { NextRequest, NextResponse } from "next/server";
import { scrapeRunManager } from "@/lib/gbp/scrape-runner";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) {
    return NextResponse.json(
      { ok: false, error: "Missing runId query parameter" },
      { status: 400 },
    );
  }

  const status = await scrapeRunManager.getStatus(runId);
  if (!status) {
    return NextResponse.json(
      { ok: false, error: "Run not found or expired" },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, ...status }, {
    headers: { "Cache-Control": "no-store" },
  });
}
