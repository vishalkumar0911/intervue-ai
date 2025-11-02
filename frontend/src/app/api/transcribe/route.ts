import { NextResponse } from "next/server";

export const runtime = "nodejs"; // required for multipart+fetch on the server

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ detail: "file is required" }, { status: 400 });
    }

    const fastapi = process.env.FASTAPI_URL || "http://127.0.0.1:8000";
    const apiKey = process.env.FASTAPI_API_KEY;

    const upstream = await fetch(`${fastapi}/api/transcribe`, {
      method: "POST",
      headers: apiKey ? { "x-api-key": apiKey } : undefined,
      body: formData, // keep multipart boundary
    });

    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    });
  } catch (err: any) {
    return NextResponse.json({ detail: "Proxy error", message: String(err?.message || err) }, { status: 500 });
  }
}
