// frontend/src/app/api/admin/users/route.ts
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

  // Read incoming JSON body safely
  const body = await req.json().catch(() => ({}));

  // Accept both `email` and `id` coming from the client; prefer provided email.
  // The backend accepts either `email` or `id`. If the client sent email, keep it.
  // If the client sent id (older UI), accept it. If neither is provided, return 422 here.
  const providedEmail = typeof body.email === "string" && body.email.trim() ? body.email.trim() : undefined;
  const providedId = typeof body.id === "string" && body.id.trim() ? body.id.trim() : undefined;

  const payload: Record<string, any> = {
    // include whichever canonical key we have (email preferred)
    ...(providedEmail ? { email: providedEmail } : {}),
    ...(providedEmail ? {} : providedId ? { id: providedId } : {}),
    // role may be string, null, or undefined
    role: body.hasOwnProperty("role") ? body.role : undefined,
  };

  // Validate presence of identifier before forwarding
  if (!payload.email && !payload.id) {
    return NextResponse.json({ error: "Either 'email' or 'id' must be provided" }, { status: 422 });
  }

  // Validate role is one of allowed values (explicit null allowed)
  const allowed = ["Student", "Trainer", "Admin", null];
  if (payload.hasOwnProperty("role") && !allowed.includes(payload.role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Forward to backend
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
