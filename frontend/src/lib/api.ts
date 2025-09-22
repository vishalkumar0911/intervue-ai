// src/lib/api.ts

/* ---------------- Types ---------------- */

export type Question = {
  id: string;
  role: string;
  text: string;
  topic?: string | null;
  difficulty?: "easy" | "medium" | "hard" | null;

  // optional metadata used by Trainer UI / backend merge
  source?: "core" | "trainer";
  readonly?: boolean | null;
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
  date?: string;
  difficulty?: "easy" | "medium" | "hard";
};

export type AttemptUpdate = Partial<AttemptCreate>;

type Stats = {
  questions_per_role: Record<string, number>;
  attempts_total: number;
  attempts_by_role: Record<string, number>;
  attempts_by_difficulty: Record<string, number>;
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

/* ---------------- Base + mode detection ---------------- */

const DIRECT_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.FASTAPI_URL ||
  "";

const FORCE_PROXY = process.env.NEXT_PUBLIC_USE_NEXT_PROXY === "true";
const USE_PROXY = FORCE_PROXY || !DIRECT_BASE;

const API_BASE = USE_PROXY ? "" : DIRECT_BASE.replace(/\/+$/, "");
const API_KEY =
  process.env.NEXT_PUBLIC_API_KEY || process.env.FASTAPI_API_KEY || "";

const p = (path: string) => (USE_PROXY ? `/api${path}` : path);
const SHOULD_ATTACH_KEY = !USE_PROXY && !!API_KEY;

const DEFAULT_TIMEOUT = 12_000;
const DEFAULT_RETRY = 1;

/* ---------------- Helpers ---------------- */

function qs(params: Record<string, string | undefined>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") u.set(k, v);
  }
  return u.toString() ? `?${u.toString()}` : "";
}

function fetchWithTimeout(
  url: string,
  opts: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT
) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() =>
    clearTimeout(id)
  );
}

async function toError(res: Response): Promise<Error> {
  let msg = `Request failed: ${res.status}`;
  try {
    const text = await res.text();
    if (text) {
      try {
        const j = JSON.parse(text);
        if (j?.detail) msg = Array.isArray(j.detail) ? j.detail[0]?.msg || msg : j.detail;
        else if (j?.error) msg = j.error || msg;
        else msg = text;
      } catch {
        msg = text;
      }
    }
  } catch {}
  return new Error(msg);
}

async function request<T>(
  path: string,
  {
    method = "GET",
    query,
    body,
    headers = {},
    timeout = DEFAULT_TIMEOUT,
    retry = method === "GET" ? DEFAULT_RETRY : 0,
    cache = "no-store" as RequestCache,
    auth = false,
  }: {
    method?: "GET" | "POST" | "PATCH" | "DELETE" | "HEAD";
    query?: Record<string, string | undefined>;
    body?: any;
    headers?: Record<string, string>;
    timeout?: number;
    retry?: number;
    cache?: RequestCache;
    auth?: boolean;
  } = {}
): Promise<T> {
  const urlStr = `${API_BASE}${path}${query ? qs(query) : ""}`;

  const init: RequestInit = {
    method,
    headers: {
      ...(auth && SHOULD_ATTACH_KEY ? { "x-api-key": API_KEY } : {}),
      ...headers,
    },
    cache,
  };

  if (body !== undefined) {
    (init.headers as Record<string, string>)["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  let attempt = 0;
  while (true) {
    attempt++;
    const res = await fetchWithTimeout(urlStr, init, timeout);
    if (res.ok) {
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) return (await res.json()) as T;

      // fallback: try to parse text into JSON
      const txt = await res.text();
      try {
        return JSON.parse(txt) as T;
      } catch {
        throw new Error(`Unexpected non-JSON response: ${txt}`);
      }
    }
    if (attempt <= retry && (res.status >= 500 || res.status === 0)) {
      await new Promise((r) => setTimeout(r, 200 * attempt));
      continue;
    }
    throw await toError(res);
  }
}

/* ---------------- Small roles cache ---------------- */

let rolesCache: { data: string[]; ts: number } | null = null;
const ROLES_TTL = 5 * 60_000;

async function getCachedRoles(): Promise<string[]> {
  const now = Date.now();
  if (rolesCache && now - rolesCache.ts < ROLES_TTL) return rolesCache.data;
  const data = await request<string[]>(p("/roles"));
  rolesCache = { data, ts: now };
  return data;
}

// force refresh (bypass cache)
async function getRolesFresh(): Promise<string[]> {
  const data = await request<string[]>(p("/roles"));
  rolesCache = { data, ts: Date.now() };
  return data;
}

/* ---------------- API ---------------- */

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  createdAt?: number;
};

export const api = {
  /* health & stats */
  health: () => request<Health>(p("/health")),
  stats: () => request<Stats>(p("/stats")),

  /* roles & questions */
  roles: () => getCachedRoles(),
  rolesFresh: () => getRolesFresh(),

  questions: ({ role, limit = 20, offset = 0, difficulty, shuffle, seed }: QuestionsParams) =>
    request<Question[]>(p("/questions"), {
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
    request<Question>(p("/question/next"), {
      query: { role, index: String(index), difficulty },
    }),

  randomQuestion: (role: string, difficulty?: "easy" | "medium" | "hard", seed?: number) =>
    request<Question>(p("/questions/random"), {
      query: { role, difficulty, seed: seed !== undefined ? String(seed) : undefined },
    }),

  searchQuestions: (q: string, role?: string, limit = 20) =>
    request<Question[]>(p("/search"), {
      query: { q, role, limit: String(limit) },
    }),

  /* attempts */
  getAttempts: ({ role, limit = 100 }: { role?: string; limit?: number } = {}) =>
    request<Attempt[]>(p("/attempts"), {
      query: { role, limit: String(limit) },
    }),

  getAttempt: (id: string) => request<Attempt>(p(`/attempts/${id}`)),

  createAttempt: (a: AttemptCreate) =>
    request<Attempt>(p("/attempts"), {
      method: "POST",
      body: a,
      auth: true,
    }),

  updateAttempt: (id: string, patch: AttemptUpdate) =>
    request<Attempt>(p(`/attempts/${id}`), {
      method: "PATCH",
      body: patch,
      auth: true,
    }),

  deleteAttempt: (id: string) =>
    request<{ ok: boolean; deleted: number; id: string }>(p(`/attempts/${id}`), {
      method: "DELETE",
      auth: true,
    }),

  /* export CSV */
  exportCSV: async ({ role }: { role?: string } = {}) => {
    const q = role ? `?role=${encodeURIComponent(role)}` : "";
    const url = `${API_BASE}${p("/attempts/export")}${q}`;
    const res = await fetchWithTimeout(url, {}, DEFAULT_TIMEOUT);
    if (!res.ok) throw await toError(res);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = "attempts.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  },

  /* auth helpers */
  auth: {
    setRole: (role: string) =>
      request<{ ok: boolean; role: string; id: string }>(p("/auth/role"), {
        method: "POST",
        body: { role },
      }),
  },

  /* Admin endpoints */
  admin: {
    listUsers: () => request<AdminUser[]>(p("/admin/users")),
    updateUserRole: (id: string, role: "Student" | "Trainer" | "Admin" | null) =>
      request<AdminUser>(p("/admin/users"), {
        method: "PATCH",
        body: { id, role },
      }),
  },

  /* Trainer endpoints */
  trainer: {
    listQuestions: (params?: {
      role?: string;
      topic?: string;
      difficulty?: "easy" | "medium" | "hard" | null;
      include_core?: boolean;
    }) =>
      request<Question[]>(p("/trainer/questions"), {
        query: {
          role: params?.role || undefined,
          topic: params?.topic || undefined,
          difficulty: params?.difficulty ?? undefined, // null => omit
          include_core: params?.include_core ? "true" : undefined,
        },
      }),

    createQuestion: (q: Pick<Question, "role" | "text"> & Partial<Question>) =>
      request<Question>(p("/trainer/questions"), { method: "POST", body: q }),

    updateQuestion: (
      id: string,
      patch: Partial<Pick<Question, "text" | "topic" | "difficulty" | "role">>
    ) =>
      request<Question>(p(`/trainer/questions/${id}`), {
        method: "PATCH",
        body: patch,
      }),

    deleteQuestion: (id: string) =>
      request<{ ok: boolean; id: string }>(p(`/trainer/questions/${id}`), {
        method: "DELETE",
      }),
  },
};
