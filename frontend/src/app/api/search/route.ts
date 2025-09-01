import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BASE = process.env.FASTAPI_URL || "http://localhost:8000";

function urlWithQuery(req: NextRequest, path: string) {
  const u = new URL(path, BASE.endsWith("/") ? BASE : BASE + "/");
  req.nextUrl.searchParams.forEach((v, k) => u.searchParams.set(k, v));
  return u.toString();
}

export async function GET(req: NextRequest) {
  const r = await fetch(urlWithQuery(req, "/search"), { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  return NextResponse.json(j, { status: r.status });
}
