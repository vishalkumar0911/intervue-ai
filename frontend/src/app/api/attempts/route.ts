// src/app/api/attempts/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BASE = process.env.FASTAPI_URL || "http://localhost:8000";
const API_KEY = process.env.FASTAPI_API_KEY || "";
const TIMEOUT_MS = 12_000;

function buildUpstreamUrl(req: NextRequest, path: string) {
  const u = new URL(path, BASE.endsWith("/") ? BASE : BASE + "/");
  // forward all query params (e.g., ?limit=200&role=Frontend%20Developer)
  req.nextUrl.searchParams.forEach((v, k) => u.searchParams.set(k, v));
  // default limit if client didn't pass one
  if (!u.searchParams.has("limit")) u.searchParams.set("limit", "200");
  return u.toString();
}

async function forward(req: NextRequest, path: string, opts?: { auth?: boolean }) {
  const { auth = false } = opts || {};
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const url = buildUpstreamUrl(req, path);
    const init: RequestInit = {
      method: req.method,
      cache: "no-store",
      signal: ctrl.signal,
      headers: {} as Record<string, string>,
    };

    // copy content-type on non-GETs (so FastAPI can parse JSON)
    const ct = req.headers.get("content-type");
    if (ct && req.method !== "GET" && req.method !== "HEAD") {
      (init.headers as Record<string, string>)["content-type"] = ct;
    }
    if (auth && API_KEY) {
      (init.headers as Record<string, string>)["x-api-key"] = API_KEY;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      // forward body as raw bytes to avoid JSON double-parsing issues
      init.body = await req.arrayBuffer();
    }

    const r = await fetch(url, init);

    // If JSON, return JSON; otherwise stream as-is
    const contentType = r.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await r.json().catch(() => ({}));
      return NextResponse.json(body, { status: r.status });
    }

    const buf = await r.arrayBuffer();
    const headers = new Headers(r.headers);
    // no need to expose CORS since this is same-origin
    headers.delete("access-control-allow-origin");
    headers.delete("access-control-allow-credentials");
    return new NextResponse(buf, { status: r.status, headers });
  } catch (err: any) {
    const message = err?.name === "AbortError" ? "Upstream timeout" : (err?.message || "Proxy error");
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}

// GET /api/attempts?limit=...&role=...
export async function GET(req: NextRequest) {
  return forward(req, "/attempts");
}

// POST /api/attempts  (mutating -> attach API key)
export async function POST(req: NextRequest) {
  return forward(req, "/attempts", { auth: true });
}
