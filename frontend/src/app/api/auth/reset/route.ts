import { proxy } from "@/app/api/_proxy";

export async function POST(request: Request) {
  // Sends x-api-key to FastAPI (same as forgot)
  return proxy(request, "/auth/reset", { auth: true });
}
