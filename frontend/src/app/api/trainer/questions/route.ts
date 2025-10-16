import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const BASE = process.env.FASTAPI_URL?.replace(/\/+$/, "") || "http://localhost:8000";
const API_KEY = process.env.FASTAPI_API_KEY || "";

async function buildAuthHeaders(session: any) {
  const h: Record<string, string> = { "x-api-key": API_KEY };
  if (session?.appJwt) h.Authorization = `Bearer ${session.appJwt}`;
  try {
    const store = await cookies(); // ⬅️ await the cookie store
    const demo = store.get("demoEmail")?.value;
    if (demo) h["x-demo-email"] = demo;
  } catch {}
  return h;
}

function ensureAuth(headers: Record<string, string>) {
  return Boolean(headers.Authorization || headers["x-demo-email"]);
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions as any);
  const headers = await buildAuthHeaders(session);
  if (!ensureAuth(headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const qs = new URL(req.url).search || "";
  const res = await fetch(`${BASE}/trainer/questions${qs}`, { headers, cache: "no-store" });
  if (!res.ok) {
    return NextResponse.json({ status: res.status, error: await res.text() }, { status: res.status });
  }
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions as any);
  const headers = await buildAuthHeaders(session);
  if (!ensureAuth(headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  if (!body.role || !body.text) {
    return NextResponse.json({ error: "Missing required fields: role, text" }, { status: 400 });
  }
  if (body.difficulty && !["easy", "medium", "hard"].includes(body.difficulty)) {
    return NextResponse.json({ error: "Invalid difficulty" }, { status: 400 });
  }

  const res = await fetch(`${BASE}/trainer/questions`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json({ status: res.status, error: await res.text() }, { status: res.status });
  }
  return NextResponse.json(await res.json(), { status: res.status });
}
