import { NextResponse } from "next/server";
import { existsSync } from "fs";
import { join } from "path";

const startTime = Date.now();

export const dynamic = "force-dynamic";

export async function GET() {
  const gbpRoot = join(process.cwd(), "..", "gbp-monitor");
  const dataDir = join(process.cwd(), "data");

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    environment: process.env.NODE_ENV ?? "development",
    apiKeyConfigured: !!process.env.API_KEY,
    pythonScraperAvailable: existsSync(join(gbpRoot, "main.py")),
    configPresent: {
      listings: existsSync(join(gbpRoot, "config", "listings.json")),
      selectors: existsSync(join(gbpRoot, "config", "selectors.json")),
    },
    dataDirectory: existsSync(dataDir),
    version: "0.2.0",
  });
}
