// src/app/api/admin/audit/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const BASE = process.env.FASTAPI_URL?.replace(/\/+$/, "") || "http://localhost:8000";
const API_KEY = process.env.FASTAPI_API_KEY || "";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions as any);
  if (!session?.appJwt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = url.searchParams.get("limit") ?? "50";

  const res = await fetch(`${BASE}/admin/audit?limit=${encodeURIComponent(limit)}`, {
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
  return NextResponse.json(await res.json(), { status: 200 });
}
