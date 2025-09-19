import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const { role } = await req.json();

  if (!role || typeof role !== "string") {
    return NextResponse.json({ error: "role required" }, { status: 400 });
  }

  // Allow both: signed-in NextAuth users OR local demo users w/o session.
  const appJwt = (session as any)?.appJwt || "";

  const res = await fetch(`${process.env.FASTAPI_URL}/auth/role`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // backend is protected by API key (same as other mutate routes)
      "x-api-key": process.env.FASTAPI_API_KEY || "",
      // pass app JWT if we have it; backend will read the email from it
      ...(appJwt ? { Authorization: `Bearer ${appJwt}` } : {}),
    },
    body: JSON.stringify({ role }),
  });

  const text = await res.text();
  if (!res.ok) {
    return new NextResponse(text || "Failed", { status: res.status });
  }
  return new NextResponse(text, { status: 200 });
}
