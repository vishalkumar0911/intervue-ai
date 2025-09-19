import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const BASE = process.env.FASTAPI_URL?.replace(/\/+$/, "") || "http://localhost:8000";

export async function GET() {
  const session = await getServerSession(authOptions as any);
  if (!session?.appJwt) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await fetch(`${BASE}/admin/users`, {
    headers: {
      authorization: `Bearer ${session.appJwt}`,
      "x-api-key": process.env.FASTAPI_API_KEY || "",
    },
  });

  if (!res.ok) {
    return NextResponse.json({ error: await res.text() }, { status: res.status });
  }
  return NextResponse.json(await res.json());
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions as any);
  if (!session?.appJwt) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  // expects: { id: string, role: "Student"|"Trainer"|"Admin"|null }
  const res = await fetch(`${BASE}/admin/users`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.appJwt}`,
      "x-api-key": process.env.FASTAPI_API_KEY || "",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return NextResponse.json({ error: await res.text() }, { status: res.status });
  }
  return NextResponse.json(await res.json());
}
