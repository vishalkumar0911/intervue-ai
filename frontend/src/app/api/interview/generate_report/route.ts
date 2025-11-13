// frontend/src/app/api/interview/generate_report/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    // This endpoint receives JSON (history, session_id)
    const body = await req.text();

    const fastapi = process.env.FASTAPI_URL || "http://127.0.0.1:8000";
    const apiKey = process.env.FASTAPI_API_KEY;

    // Proxy the JSON body to the backend's new endpoint
    const upstream = await fetch(`${fastapi}/interview/generate_report`, {
      method: "POST",
      headers: {
        ...(apiKey ? { "x-api-key": apiKey } : {}),
        "content-type": "application/json",
      },
      body: body,
    });

    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "content-type":
          upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { detail: "Proxy error", message: String(err?.message || err) },
      { status: 500 }
    );
  }
}