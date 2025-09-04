import { getServerSession } from "next-auth";
import { authOptions } from "./auth/[...nextauth]/route";

const BASE = process.env.FASTAPI_URL || "http://localhost:8000";
const KEY  = process.env.FASTAPI_API_KEY || "";

function makeUpstreamUrl(request: Request, path: string) {
  const upstream = new URL(path, BASE);
  const inUrl = new URL(request.url);
  inUrl.searchParams.forEach((v, k) => upstream.searchParams.set(k, v));
  return upstream.toString();
}

/**
 * Server-side proxy to FastAPI. Attaches x-api-key (service) and Authorization (user) when available.
 * Streams the response back to the browser; never exposes secrets to the client.
 */
export async function proxy(
  request: Request,
  path: string,
  opts: { auth?: boolean } = {}
) {
  const { auth = false } = opts;

  // Read NextAuth session on the server and forward your app JWT if present.
  const session = await getServerSession(authOptions as any);
  const appJwt = (session as any)?.appJwt as string | undefined;

  const headers: Record<string, string> = {};
  const ct = request.headers.get("content-type");
  if (ct) headers["content-type"] = ct;
  if (auth && KEY) headers["x-api-key"] = KEY;               // service key (FastAPI API key)
  if (appJwt) headers["authorization"] = `Bearer ${appJwt}`; // user identity (your app JWT)


  const res = await fetch(makeUpstreamUrl(request, path), {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.arrayBuffer(),
    cache: "no-store",
    redirect: "manual",
  });

  // Copy upstream headers but strip CORS; response is same-origin now.
  const outHeaders = new Headers(res.headers);
  outHeaders.delete("access-control-allow-origin");
  outHeaders.delete("access-control-credentials");

  return new Response(res.body, { status: res.status, headers: outHeaders });
}
