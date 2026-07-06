import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Per-IP sliding-window rate limits for the API routes that spend money
// (Claude tokens, BigQuery jobs). In-memory state is per serverless
// instance, so this is a cost fuse rather than a hard guarantee; a shared
// store (Vercel KV / Upstash) is the production upgrade.
const WINDOW_MS = 60_000;
const LIMITS: Record<string, number> = {
  "/api/agent": 8,
  "/api/blurb": 15,
  "/api/comps": 30,
  "/api/players": 30,
  "/api/leaders": 30,
  "/api/shots": 30,
};

const hits = new Map<string, number[]>();

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const limit = LIMITS[path];
  if (!limit) return NextResponse.next();

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const key = `${ip}:${path}`;
  const now = Date.now();

  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= limit) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }
  recent.push(now);
  hits.set(key, recent);

  // opportunistic cleanup so the map doesn't grow unbounded
  if (hits.size > 5000) {
    for (const [k, timestamps] of hits) {
      if (timestamps.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
