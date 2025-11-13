// frontend/src/app/api/interview/start/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs"; // Required for FormData handling

export async function POST(req: Request) {
  try {
    // We are receiving FormData (role, type, file)
    const formData = await req.formData();

    const fastapi = process.env.FASTAPI_URL || "http://127.0.0.1:8000";
    const apiKey = process.env.FASTAPI_API_KEY;

    // Proxy the entire FormData (including the file) to the backend
    const upstream = await fetch(`${fastapi}/interview/start`, {
      method: "POST",
      headers: {
        ...(apiKey ? { "x-api-key": apiKey } : {}),
        // We DO NOT set Content-Type, we let fetch() do it
        // so it can correctly set the multipart/form-data boundary
      },
      body: formData,
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