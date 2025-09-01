// Next.js App Router
import { NextRequest, NextResponse } from "next/server";

const BASE = process.env.FASTAPI_URL!;
const API_KEY = process.env.FASTAPI_API_KEY!;

export async function GET() {
  const r = await fetch(`${BASE}/attempts?limit=200`, { cache: "no-store" });
  const j = await r.json();
  return NextResponse.json(j, { status: r.status });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const r = await fetch(`${BASE}/attempts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return NextResponse.json(j, { status: r.status });
}
