import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const FASTAPI_URL = process.env.FASTAPI_URL || "http://127.0.0.1:8000";
  const FASTAPI_API_KEY = process.env.FASTAPI_API_KEY;

  const body = await req.text(); // pass-through JSON
  const res = await fetch(new URL("/api/analyze", FASTAPI_URL).toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(FASTAPI_API_KEY ? { "x-api-key": FASTAPI_API_KEY } : {}),
    },
    body,
    cache: "no-store",
  });

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
