// src/lib/api.ts
export type Question = {
  id: string;
  role: string;
  text: string;
  topic?: string | null;
  difficulty?: "easy" | "medium" | "hard" | null;
};

export type Attempt = {
  id: string;
  role: string;
  score: number;
  duration_min: number;
  date: string; // ISO
  difficulty?: "easy" | "medium" | "hard" | null;
};

export type AttemptCreate = {
  role: string;
  score: number;
  duration_min: number;
  date?: string; // optional; server sets if missing
  difficulty?: "easy" | "medium" | "hard";
};

export type AttemptUpdate = Partial<AttemptCreate>;

type Stats = {
  total: number;
  roles: Array<{ role: string; count: number; avg: number }>;
  last_7d: { count: number; avg: number };
};

export type Health = {
  ok: boolean;
  roles: string[];
  counts: Record<string, number>;
  questions_file: string;
  attempts_file: string;
  last_questions_load_ts: number;
  server_time: number;
};

type QuestionsParams = {
  role: string;
  limit?: number;
  offset?: number;
  difficulty?: "easy" | "medium" | "hard";
  shuffle?: boolean;
  seed?: number;
};

/* ---------------- base + helpers ---------------- */

const rawBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const API_BASE = rawBase.replace(/\/+$/, ""); // ensure no trailing slash
const API_KEY = process.env.NEXT_PUBLIC_API_KEY;

// Global defaults
const DEFAULT_TIMEOUT = 12_000;
const DEFAULT_RETRY = 1;

/** Attach API key header for mutating requests. */
function authHeaders() {
  return API_KEY ? { "x-api-key": API_KEY } : {};
}

/** Build a querystring without empty values. */
function qs(params: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") p.set(k, v);
  }
  return p.toString();
}

/** Abortable fetch with timeout. */
function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(id));
}

/** Parse FastAPI error (string or JSON) into a friendly Error. */
async function toError(res: Response): Promise<Error> {
  let msg = `Request failed: ${res.status}`;
  try {
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      if (j?.detail) {
        msg = Array.isArray(j.detail) ? j.detail[0]?.msg || msg : j.detail;
      } else {
        msg = text || msg;
      }
    } catch {
      msg = text || msg;
    }
  } catch {}
  return new Error(msg);
}

/** Unified request helper. Handles JSON body, query, auth, retry for GET. */
async function request<T>(
  path: string,
  {
    method = "GET",
    query,
    body,
    headers = {},
    timeout = DEFAULT_TIMEOUT,
    auth = false,
    retry = method === "GET" ? DEFAULT_RETRY : 0,
    cache = "no-store" as RequestCache,
  }: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    query?: Record<string, string | undefined>;
    body?: any;
    headers?: Record<string, string>;
    timeout?: number;
    auth?: boolean; // attach API key
    retry?: number;
    cache?: RequestCache;
  } = {},
): Promise<T> {
  const url = new URL(API_BASE + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, v);
    }
  }

  const init: RequestInit = {
    method,
    headers: {
      ...(auth ? authHeaders() : {}),
      ...headers,
    },
    cache,
  };
  if (body !== undefined) {
    init.headers = {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    };
    init.body = JSON.stringify(body);
  }

  let attempt = 0;
  while (true) {
    attempt++;
    const res = await fetchWithTimeout(url.toString(), init, timeout);
    if (res.ok) {
      // CSV export will be handled separately using fetch directly
      return (await res.json()) as T;
    }
    // Only retry on network-ish failures or 5xx
    if (attempt <= retry && (res.status >= 500 || res.status === 0)) {
      await new Promise((r) => setTimeout(r, 200 * attempt)); // small backoff
      continue;
    }
    throw await toError(res);
  }
}

/* ---------------- Small in-memory cache for roles ---------------- */
let rolesCache: { data: string[]; ts: number } | null = null;
const ROLES_TTL = 5 * 60_000; // 5 minutes

async function getCachedRoles(): Promise<string[]> {
  const now = Date.now();
  if (rolesCache && now - rolesCache.ts < ROLES_TTL) {
    return rolesCache.data;
  }
  const data = await request<string[]>("/roles");
  rolesCache = { data, ts: now };
  return data;
}

/* ---------------- API ---------------- */

export const api = {
  /* ---- health & stats (optional) ---- */
  health: () => request<Health>("/health"),
  stats: () => request<Stats>("/stats"),

  /* ---- roles & questions ---- */
  roles: () => getCachedRoles(),

  questions: ({ role, limit = 20, offset = 0, difficulty, shuffle, seed }: QuestionsParams) =>
    request<Question[]>("/questions", {
      query: {
        role,
        limit: String(limit),
        offset: String(offset),
        difficulty,
        shuffle: shuffle ? "true" : undefined,
        seed: seed !== undefined ? String(seed) : undefined,
      },
    }),

  nextQuestion: (role: string, index = 0, difficulty?: "easy" | "medium" | "hard") =>
    request<Question>("/question/next", {
      query: { role, index: String(index), difficulty },
    }),

  randomQuestion: (role: string, difficulty?: "easy" | "medium" | "hard", seed?: number) =>
    request<Question>("/questions/random", {
      query: {
        role,
        difficulty,
        seed: seed !== undefined ? String(seed) : undefined,
      },
    }),

  searchQuestions: (q: string, role?: string, limit = 20) =>
    request<Question[]>("/search", {
      query: { q, role, limit: String(limit) },
    }),

  /* ---- attempts ---- */
  getAttempts: ({ role, limit = 100 }: { role?: string; limit?: number } = {}) =>
    request<Attempt[]>("/attempts", {
      query: { role, limit: String(limit) },
    }),

  getAttempt: (id: string) => request<Attempt>(`/attempts/${id}`),

  createAttempt: (a: AttemptCreate) =>
    request<Attempt>("/attempts", {
      method: "POST",
      body: a,
      auth: true,
    }),

  updateAttempt: (id: string, patch: AttemptUpdate) =>
    request<Attempt>(`/attempts/${id}`, {
      method: "PATCH",
      body: patch,
      auth: true,
    }),

  deleteAttempt: (id: string) =>
    request<{ ok: boolean; deleted: number; id: string }>(`/attempts/${id}`, {
      method: "DELETE",
      auth: true,
    }),

  /* ---- Export CSV (download helper) ---- */
  exportCSV: async ({ role }: { role?: string } = {}) => {
    const query = role ? `?role=${encodeURIComponent(role)}` : "";
    const res = await fetchWithTimeout(`${API_BASE}/attempts/export${query}`, {}, DEFAULT_TIMEOUT);
    if (!res.ok) throw await toError(res);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "attempts.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
