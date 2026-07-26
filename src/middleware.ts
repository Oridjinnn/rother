/**
 * Middleware that protects mutating API endpoints with an API key.
 *
 * - Reads `API_KEY` from environment variables.
 * - If `API_KEY` is not set, all requests pass through (development mode).
 * - If `API_KEY` is set, mutating methods (POST, PATCH, PUT, DELETE) on `/api/*`
 *   routes require `Authorization: Bearer <API_KEY>`.
 * - GET and HEAD requests to `/api/*` are allowed without auth (read-only).
 * - Static assets and the main page are not affected.
 *
 * Security rationale:
 * - Internal deployments need a simple auth layer without user management.
 * - A shared API key is appropriate for pilot/internal use.
 * - Mutating endpoints are the highest-risk targets (scraper trigger, config write).
 * - GET endpoints are read-only and expose no sensitive operations.
 * - The key is never exposed to the client — client-side fetches to mutating
 *   endpoints are proxied through Next.js (same-origin), so the middleware
 *   check on the server side is sufficient.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const API_KEY = process.env.API_KEY;

// Simple in-memory rate limiter (per IP, per minute).
// Reset on server restart — acceptable for internal pilot.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect API routes
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const method = request.method;

  // Rate limiting: track by IP for all API requests
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "127.0.0.1";
  const rateLimitKey = `${ip}:${pathname}`;
  if (rateLimited(rateLimitKey)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Too many requests. Please wait before trying again.",
        stderr: "",
        stage: "rate_limited",
        probable_cause: "Request rate exceeded the allowed limit.",
        suggested_fix: "Retry after 60 seconds.",
      },
      { status: 429 },
    );
  }

  // Skip auth for GET and HEAD (read-only endpoints)
  if (method === "GET" || method === "HEAD") {
    return NextResponse.next();
  }

  // If no API key is configured, allow mutating requests in dev mode
  if (!API_KEY) {
    return NextResponse.next();
  }

  // Check for API key on mutating methods
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing or invalid Authorization header. Use: Authorization: Bearer <API_KEY>",
        stderr: "",
        stage: "unauthorized",
        probable_cause: "No API key provided.",
        suggested_fix: "Set API_KEY in your environment and include Authorization: Bearer <key> in requests.",
      },
      { status: 401 },
    );
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (token !== API_KEY) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid API key.",
        stderr: "",
        stage: "unauthorized",
        probable_cause: "The provided API key does not match the configured API_KEY.",
        suggested_fix: "Verify the API_KEY environment variable and the key sent in the Authorization header.",
      },
      { status: 401 },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
