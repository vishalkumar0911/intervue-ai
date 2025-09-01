import { NextRequest, NextResponse } from "next/server";
const BASE = process.env.FASTAPI_URL!;
const API_KEY = process.env.FASTAPI_API_KEY!;

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const r = await fetch(`${BASE}/attempts/${params.id}`, { cache: "no-store" });
  const j = await r.json();
  return NextResponse.json(j, { status: r.status });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const r = await fetch(`${BASE}/attempts/${params.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return NextResponse.json(j, { status: r.status });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const r = await fetch(`${BASE}/attempts/${params.id}`, {
    method: "DELETE",
    headers: { "x-api-key": API_KEY },
  });
  const j = await r.json().catch(() => ({}));
  return NextResponse.json(j, { status: r.status });
}
