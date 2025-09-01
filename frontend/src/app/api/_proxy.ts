// src/app/api/_proxy.ts
const BASE = process.env.FASTAPI_URL || "http://localhost:8000";
const KEY  = process.env.FASTAPI_API_KEY || "";

function makeUpstreamUrl(request: Request, path: string) {
  const upstream = new URL(path, BASE);
  const inUrl = new URL(request.url);
  inUrl.searchParams.forEach((v, k) => upstream.searchParams.set(k, v));
  return upstream.toString();
}

/**
 * Server-side proxy to FastAPI. Attaches x-api-key only when auth=true.
 * Streams response back to the browser. Never exposes the key to the client.
 */
export async function proxy(request: Request, path: string, opts: { auth?: boolean } = {}) {
  const { auth = false } = opts;
  const headers: Record<string, string> = {};
  const ct = request.headers.get("content-type");
  if (ct) headers["content-type"] = ct;
  if (auth && KEY) headers["x-api-key"] = KEY;

  const res = await fetch(makeUpstreamUrl(request, path), {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
    cache: "no-store",
    redirect: "manual",
  });

  // Copy upstream headers but strip CORS; response is same-origin now.
  const outHeaders = new Headers(res.headers);
  outHeaders.delete("access-control-allow-origin");
  outHeaders.delete("access-control-credentials");

  return new Response(res.body, { status: res.status, headers: outHeaders });
}
