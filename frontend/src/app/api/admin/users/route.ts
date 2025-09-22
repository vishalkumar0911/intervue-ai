// src/app/api/admin/users/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const BASE =
  process.env.FASTAPI_URL?.replace(/\/+$/, "") || "http://localhost:8000";
const API_KEY = process.env.FASTAPI_API_KEY || "";

async function buildAuthHeaders(session: any) {
  const h: Record<string, string> = { "x-api-key": API_KEY };
  if (session?.appJwt) h.Authorization = `Bearer ${session.appJwt}`;

  // NEXT 15: cookies() is async in route handlers
  try {
    const store = await cookies();
    const demo = store.get("demoEmail")?.value;
    if (demo) h["x-demo-email"] = demo;
  } catch {
    /* ignore */
  }
  return h;
}

function ensureAuth(headers: Record<string, string>) {
  // allow either Bearer (NextAuth) or dev header (demo cookie)
  return Boolean(headers.Authorization || headers["x-demo-email"]);
}

export async function GET() {
  const session = await getServerSession(authOptions as any);
  const headers = await buildAuthHeaders(session);
  if (!ensureAuth(headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const res = await fetch(`${BASE}/admin/users`, {
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json(
      { status: res.status, error: await res.text() },
      { status: res.status }
    );
  }
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions as any);
  const headers = await buildAuthHeaders(session);
  if (!ensureAuth(headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const payload = { email: body.id, role: body.role }; // id=email from UI

  const allowed = ["Student", "Trainer", "Admin", null];
  if (!allowed.includes(payload.role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const res = await fetch(`${BASE}/admin/users`, {
    method: "PATCH",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    return NextResponse.json(
      { status: res.status, error: await res.text() },
      { status: res.status }
    );
  }
  return NextResponse.json(await res.json(), { status: res.status });
}
