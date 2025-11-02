// frontend/src/app/api/auth/forgot/route.ts
import { proxy } from "@/app/api/_proxy";
export async function POST(request: Request) {
  return proxy(request, "/auth/forgot", { auth: true });
}
