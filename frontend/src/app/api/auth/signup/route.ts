import { proxy } from "@/app/api/_proxy";

export async function POST(request: Request) {
  // Proxy POST request to FastAPI /auth/signup.
  // The { auth: true } option ensures the FASTAPI_API_KEY is attached for security.
  return proxy(request, "/auth/signup", { auth: true });
}