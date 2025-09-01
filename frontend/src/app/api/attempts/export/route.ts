import { NextRequest, NextResponse } from "next/server";
const BASE = process.env.FASTAPI_URL!;

export async function GET(req: NextRequest) {
  const role = req.nextUrl.searchParams.get("role");
  const url = `${BASE}/attempts/export${role ? `?role=${encodeURIComponent(role)}` : ""}`;
  const r = await fetch(url, { cache: "no-store" });
  const blob = await r.arrayBuffer();
  return new NextResponse(blob, {
    status: r.status,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="attempts.csv"',
    },
  });
}
