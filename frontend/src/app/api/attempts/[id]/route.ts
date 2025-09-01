// src/app/api/attempts/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";

const BASE = process.env.FASTAPI_URL!;
const API_KEY = process.env.FASTAPI_API_KEY!;

async function callUpstream(
  req: NextRequest,
  id: string,
  init: { method?: "GET" | "PATCH" | "DELETE"; body?: any; auth?: boolean } = {},
) {
  const { method = "GET", body, auth = false } = init;

  const headers: Record<string, string> = {};
  if (auth) headers["x-api-key"] = API_KEY;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const r = await fetch(`${BASE}/attempts/${id}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  const ct = r.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const j = await r.json().catch(() => ({}));
    return NextResponse.json(j, { status: r.status });
  }
  const text = await r.text().catch(() => "");
  return new NextResponse(text, { status: r.status });
}

// NOTE: params is a Promise in Next 15
type ParamsP = Promise<{ id: string }>;

export async function GET(req: NextRequest, { params }: { params: ParamsP }) {
  const { id } = await params;
  return callUpstream(req, id);
}

export async function PATCH(req: NextRequest, { params }: { params: ParamsP }) {
  const { id } = await params;
  const body = await req.json();
  return callUpstream(req, id, { method: "PATCH", body, auth: true });
}

export async function DELETE(req: NextRequest, { params }: { params: ParamsP }) {
  const { id } = await params;
  return callUpstream(req, id, { method: "DELETE", auth: true });
}
