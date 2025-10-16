// src/app/api/admin/seed/route.ts
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
    const store = await cookies();
    const demo = store.get("demoEmail")?.value;
    if (demo) h["x-demo-email"] = demo;
  } catch {}
  return h;
}
function ensureAuth(headers: Record<string, string>) {
  return Boolean(headers.Authorization || headers["x-demo-email"]);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions as any);
  const headers = await buildAuthHeaders(session);
  if (!ensureAuth(headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const count = typeof body.count === "number" ? body.count : 20;
  const seed  = typeof body.seed  === "number" ? body.seed  : 42;
  const role  = typeof body.role  === "string" && body.role.trim() ? body.role.trim() : undefined;

  const url = new URL(`${BASE}/dev/seed`);
  url.searchParams.set("count", String(count));
  url.searchParams.set("seed", String(seed));
  if (role) url.searchParams.set("role", role);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json({ status: res.status, error: await res.text() }, { status: res.status });
  }
  return NextResponse.json(await res.json(), { status: 200 });
}
