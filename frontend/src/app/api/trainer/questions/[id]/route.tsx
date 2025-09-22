import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const BASE = process.env.FASTAPI_URL?.replace(/\/+$/, "") || "http://localhost:8000";
const API_KEY = process.env.FASTAPI_API_KEY || "";

function isValidDifficulty(v: unknown) {
  return v === undefined || v === null || ["easy", "medium", "hard"].includes(String(v));
}

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

export async function PATCH(
  req: NextRequest,
  ctx: { params: { id: string } } | { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions as any);
  const headers = await buildAuthHeaders(session);
  if (!ensureAuth(headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } =
    "then" in (ctx.params as any) ? await (ctx.params as any) : (ctx.params as any);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const patch: Record<string, unknown> = {};
  if ("text" in body) patch.text = (body as any).text;
  if ("role" in body) patch.role = (body as any).role;
  if ("topic" in body) patch.topic = (body as any).topic ?? null;
  if ("difficulty" in body) patch.difficulty = (body as any).difficulty ?? null;

  if ("difficulty" in patch && !isValidDifficulty(patch.difficulty)) {
    return NextResponse.json({ error: "Invalid difficulty" }, { status: 400 });
  }

  const res = await fetch(`${BASE}/trainer/questions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(patch),
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json({ status: res.status, error: await res.text() }, { status: res.status });
  }
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: { id: string } } | { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions as any);
  const headers = await buildAuthHeaders(session);
  if (!ensureAuth(headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } =
    "then" in (ctx.params as any) ? await (ctx.params as any) : (ctx.params as any);

  const res = await fetch(`${BASE}/trainer/questions/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json({ status: res.status, error: await res.text() }, { status: res.status });
  }
  return NextResponse.json(await res.json(), { status: res.status });
}
