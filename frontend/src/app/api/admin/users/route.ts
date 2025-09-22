// src/app/api/admin/users/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const BASE = process.env.FASTAPI_URL?.replace(/\/+$/, "") || "http://localhost:8000";
const API_KEY = process.env.FASTAPI_API_KEY || "";

export async function GET() {
  const session = await getServerSession(authOptions as any);
  if (!session?.appJwt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const res = await fetch(`${BASE}/admin/users`, {
    headers: {
      Authorization: `Bearer ${session.appJwt}`,
      "x-api-key": API_KEY,
    },
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
  if (!session?.appJwt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const payload = { email: body.id, role: body.role }; // normalize to backend expectation

  const allowed = ["Student", "Trainer", "Admin", null];
  if (!allowed.includes(payload.role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const res = await fetch(`${BASE}/admin/users`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${session.appJwt}`,
      "x-api-key": API_KEY,
    },
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
