import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BASE = process.env.FASTAPI_URL || "http://localhost:8000";

export async function GET() {
  const r = await fetch(`${BASE}/stats`, { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  return NextResponse.json(j, { status: r.status });
}
