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
  /** If you exposed /stats on the backend, shape might look like this */
  total: number;
  roles: Array<{ role: string; count: number; avg: number }>;
  last_7d: { count: number; avg: number };
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
// ensure no trailing slash
const API_BASE = rawBase.replace(/\/+$/, "");
const API_KEY = process.env.NEXT_PUBLIC_API_KEY;

/** Only attach API key for mutations (POST/PATCH/DELETE) */
function authHeaders() {
  return API_KEY ? { "x-api-key": API_KEY } : {};
}

/** Build a querystring without empty values */
function qs(params: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") p.set(k, v);
  }
  return p.toString();
}

/** Abortable fetch with timeout */
function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = 12_000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: ctrl.signal })
    .finally(() => clearTimeout(id));
}

/** Safe response -> JSON with rich FastAPI error extraction */
async function safe<T>(p: Promise<Response>): Promise<T> {
  const res = await p;
  if (!res.ok) {
    let msg = `Request failed: ${res.status}`;
    try {
      const text = await res.text();
      try {
        const j = JSON.parse(text);
        if (j?.detail) {
          msg = Array.isArray(j.detail) ? (j.detail[0]?.msg || msg) : j.detail;
        } else {
          msg = text || msg;
        }
      } catch {
        msg = text || msg;
      }
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  // Most endpoints return JSON
  return res.json() as Promise<T>;
}

/* ---------------- API ---------------- */

export const api = {
  /* ---- roles & questions ---- */

  roles: () => safe<string[]>(
    fetchWithTimeout(`${API_BASE}/roles`, { cache: "no-store" })
  ),

  questions: ({ role, limit = 20, offset = 0, difficulty, shuffle, seed }: QuestionsParams) => {
    const query = qs({
      role,
      limit: String(limit),
      offset: String(offset),
      difficulty,
      shuffle: shuffle ? "true" : undefined,
      seed: seed !== undefined ? String(seed) : undefined,
    });
    return safe<Question[]>(
      fetchWithTimeout(`${API_BASE}/questions?${query}`, { cache: "no-store" })
    );
  },

  nextQuestion: (role: string, index = 0, difficulty?: "easy" | "medium" | "hard") => {
    const query = qs({ role, index: String(index), difficulty });
    return safe<Question>(
      fetchWithTimeout(`${API_BASE}/question/next?${query}`, { cache: "no-store" })
    );
  },

  randomQuestion: (role: string, difficulty?: "easy" | "medium" | "hard", seed?: number) => {
    const query = qs({
      role,
      difficulty,
      seed: seed !== undefined ? String(seed) : undefined,
    });
    return safe<Question>(
      fetchWithTimeout(`${API_BASE}/questions/random?${query}`, { cache: "no-store" })
    );
  },

  searchQuestions: (q: string, role?: string, limit = 20) => {
    const query = qs({ q, role, limit: String(limit) });
    return safe<Question[]>(
      fetchWithTimeout(`${API_BASE}/search?${query}`, { cache: "no-store" })
    );
  },

  /* ---- attempts ---- */

  getAttempts: ({ role, limit = 100 }: { role?: string; limit?: number } = {}) => {
    const query = qs({ role, limit: String(limit) });
    return safe<Attempt[]>(
      fetchWithTimeout(`${API_BASE}/attempts?${query}`, { cache: "no-store" })
    );
  },

  getAttempt: (id: string) =>
    safe<Attempt>(
      fetchWithTimeout(`${API_BASE}/attempts/${id}`, { cache: "no-store" })
    ),

  createAttempt: (a: AttemptCreate) =>
    safe<Attempt>(
      fetchWithTimeout(`${API_BASE}/attempts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(a),
      })
    ),

  updateAttempt: (id: string, patch: AttemptUpdate) =>
    safe<Attempt>(
      fetchWithTimeout(`${API_BASE}/attempts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(patch),
      })
    ),

  deleteAttempt: (id: string) =>
    safe<{ ok: boolean; deleted: number; id: string }>(
      fetchWithTimeout(`${API_BASE}/attempts/${id}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
      })
    ),

  /* ---- optional: aggregate stats (if backend exposes /stats) ---- */

  stats: () =>
    safe<Stats>(
      fetchWithTimeout(`${API_BASE}/stats`, { cache: "no-store" })
    ),
};
