// frontend/src/app/api/auth/role/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const BACKEND = process.env.FASTAPI_URL?.replace(/\/+$/, "") || "http://localhost:8000";
const BACKEND_API_KEY = process.env.FASTAPI_API_KEY || "";

/**
 * Helper to build headers for requests to FastAPI.
 * Prefer Authorization (appJwt) when present; include x-demo-email cookie if present.
 */
async function buildForwardHeaders(session: any) {
  const h: Record<string, string> = {};
  if (BACKEND_API_KEY) h["x-api-key"] = BACKEND_API_KEY;
  if (session?.appJwt) h["Authorization"] = `Bearer ${session.appJwt}`;

  try {
    const store = await cookies();
    const demo = store.get("demoEmail")?.value;
    if (demo) h["x-demo-email"] = demo;
  } catch {
    // ignore cookie read errors
  }

  return h;
}

/**
 * GET /api/auth/role?email=someone@example.com
 * Forwards to FastAPI /auth/role (GET) and returns the JSON result.
 *
 * This is used by local/demo clients to fetch the canonical role for an email.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions as any);
  const url = new URL(req.url);
  const email = url.searchParams.get("email")?.trim() || "";

  if (!email) {
    return NextResponse.json({ error: "email query parameter required" }, { status: 422 });
  }

  const headers = await buildForwardHeaders(session);

  // Forward the GET to backend
  const forwardUrl = `${BACKEND}/auth/role?email=${encodeURIComponent(email)}`;
  try {
    const res = await fetch(forwardUrl, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    const txt = await res.text();
    // try to parse JSON; if not JSON, return raw text
    try {
      const j = txt ? JSON.parse(txt) : {};
      if (!res.ok) {
        return NextResponse.json({ status: res.status, error: j || txt }, { status: res.status });
      }
      return NextResponse.json(j, { status: res.status });
    } catch {
      if (!res.ok) return new NextResponse(txt || "Failed", { status: res.status });
      return new NextResponse(txt || "", { status: res.status });
    }
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

/**
 * POST /api/auth/role
 * body: { role: string | null, email?: string }
 *
 * - If email is provided, proxy that to backend (admin routes typically require auth on backend).
 * - If email omitted, we attempt to set the role for the authenticated user (via appJwt) or demo cookie email.
 *
 * This mirrors the backend mutate semantics used elsewhere in the app.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions as any);
  const headers = await buildForwardHeaders(session);

  const body = await req.json().catch(() => ({}));
  const role = body.hasOwnProperty("role") ? body.role : undefined;
  const email = typeof body.email === "string" && body.email.trim() ? body.email.trim() : undefined;

  // Validate role shape if present (allow null to clear)
  if (role !== undefined && role !== null && typeof role !== "string") {
    return NextResponse.json({ error: "role must be string or null" }, { status: 400 });
  }

  // Build payload to forward. If email provided, include it; otherwise backend should derive from token/demo header.
  const payload: Record<string, any> = {};
  if (email) payload.email = email;
  // include role even if null (explicit clear)
  if (body.hasOwnProperty("role")) payload.role = role;

  // Determine the target endpoint and method:
  // 1. If no 'email' is present, assume self-service (POST /auth/role) - unauthenticated users can set their *own* role.
  // 2. If 'email' is present, assume admin action (PATCH /admin/users) - requires Admin role/API key to set *another* user's role.
  const isSelfService = !payload.email;
  const forwardUrl = isSelfService ? `${BACKEND}/auth/role` : `${BACKEND}/admin/users`;
  const forwardMethod = isSelfService ? "POST" : "PATCH";

  // Minimal validation: ensure we have an identity if no email provided
  if (!payload.email) {
    // If we neither have email nor an appJwt/demo cookie, reject.
    const hasIdentity = Boolean(headers["Authorization"] || headers["x-demo-email"]);
    if (!hasIdentity) {
      return NextResponse.json({ error: "Must provide email or be authenticated" }, { status: 401 });
    }
  }

  try {
    const res = await fetch(forwardUrl, {
      method: forwardMethod,
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const txt = await res.text();
    try {
      const j = txt ? JSON.parse(txt) : {};
      if (!res.ok) {
        return NextResponse.json({ status: res.status, error: j || txt }, { status: res.status });
      }
      return NextResponse.json(j, { status: res.status });
    } catch {
      if (!res.ok) return new NextResponse(txt || "Failed", { status: res.status });
      return new NextResponse(txt || "", { status: res.status });
    }
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}