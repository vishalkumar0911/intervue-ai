import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const FASTAPI_URL = process.env.FASTAPI_URL || "http://127.0.0.1:8000";
  const FASTAPI_API_KEY = process.env.FASTAPI_API_KEY;

  const url = new URL("/analysis", FASTAPI_URL);
  const session_id = req.nextUrl.searchParams.get("session_id");
  const limit = req.nextUrl.searchParams.get("limit");
  if (session_id) url.searchParams.set("session_id", session_id);
  if (limit) url.searchParams.set("limit", limit);

  const res = await fetch(url, {
    method: "GET",
    headers: FASTAPI_API_KEY ? { "x-api-key": FASTAPI_API_KEY } : undefined,
    cache: "no-store",
  });

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
