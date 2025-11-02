// src/app/api/health/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BASE = process.env.FASTAPI_URL?.replace(/\/+$/, "") || "http://localhost:8000";

export async function GET() {
  try {
    const r = await fetch(`${BASE}/health`, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    return NextResponse.json(j, { status: r.status });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "Upstream FastAPI unreachable", detail: String(err?.message || err) },
      { status: 502 }
    );
  }
}
