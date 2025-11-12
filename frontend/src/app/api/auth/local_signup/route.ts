// frontend/src/app/api/auth/local_signup/route.ts
import { NextRequest } from "next/server";
import { proxy } from "@/app/api/_proxy";

/**
 * Simple server-side proxy that forwards POST /api/auth/local_signup
 * to upstream FastAPI /auth/signup and attaches the service API key
 * (via proxy(..., { auth: true })) so backend will persist the user.
 *
 * This keeps the API key on server-side only.
 */

export async function POST(req: NextRequest) {
  // Proxy will forward headers/body and attach x-api-key from env
  return proxy(req as unknown as Request, "/auth/signup", { auth: true });
}
