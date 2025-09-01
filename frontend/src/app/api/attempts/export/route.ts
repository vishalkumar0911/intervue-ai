// src/app/api/attempts/export/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BASE = process.env.FASTAPI_URL || "http://localhost:8000";
const TIMEOUT_MS = 20_000; // a bit longer for CSV streams

function buildUrl(req: NextRequest) {
  const u = new URL("/attempts/export", BASE.endsWith("/") ? BASE : BASE + "/");
  // forward all query params (e.g., ?role=Frontend%20Developer)
  req.nextUrl.searchParams.forEach((v, k) => u.searchParams.set(k, v));
  return u.toString();
}

export async function GET(req: NextRequest) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const r = await fetch(buildUrl(req), { cache: "no-store", signal: ctrl.signal });

    const buf = await r.arrayBuffer();
    const headers = new Headers();

    // Preserve upstream headers when possible; set sensible defaults
    const ct = r.headers.get("content-type") || "text/csv; charset=utf-8";
    const cd = r.headers.get("content-disposition") || 'attachment; filename="attempts.csv"';

    headers.set("content-type", ct);
    headers.set("content-disposition", cd);

    return new NextResponse(buf, { status: r.status, headers });
  } catch (err: any) {
    const message = err?.name === "AbortError" ? "Upstream timeout" : (err?.message || "Proxy error");
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
