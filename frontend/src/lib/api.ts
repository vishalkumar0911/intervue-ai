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
  date: string; // ISO string
};

export type AttemptCreate = {
  role: string;
  score: number;         // 0..100
  duration_min: number;  // minutes
  date?: string;         // optional; server will set if omitted
};

// ---------- Config ----------
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const DEFAULT_TIMEOUT_MS = 15000;

// ---------- Utils ----------
function qs(params: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") p.set(k, v);
  }
  return p.toString();
}

async function withTimeout<T>(promise: Promise<T>, ms = DEFAULT_TIMEOUT_MS): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort("timeout"), ms);
  try {
    // @ts-expect-error we pass controller from callers
    return await promise(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function safeGet<T>(path: string): Promise<T> {
  return withTimeout<T>(
    (signal: AbortSignal) =>
      fetch(`${API_BASE}${path}`, { cache: "no-store", signal }).then(async (res) => {
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`GET ${path} → ${res.status} ${text}`);
        }
        return res.json();
      })
  );
}

async function safePost<T>(path: string, body: unknown): Promise<T> {
  return withTimeout<T>(
    (signal: AbortSignal) =>
      fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal,
      }).then(async (res) => {
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`POST ${path} → ${res.status} ${text}`);
        }
        return res.json();
      })
  );
}

// ---------- API ----------
type QuestionsParams = {
  role: string;
  limit?: number;
  offset?: number;
  difficulty?: "easy" | "medium" | "hard";
  shuffle?: boolean;
  seed?: number;
};

export const api = {
  // Health (useful for local debugging)
  health: () => safeGet<{
    ok: boolean;
    roles: string[];
    counts: Record<string, number>;
    questions_file: string;
    attempts_file?: string;
    server_time: number;
  }>("/health"),

  // Roles & Questions
  roles: () => safeGet<string[]>("/roles"),

  questions: ({ role, limit = 20, offset = 0, difficulty, shuffle, seed }: QuestionsParams) => {
    const query = qs({
      role,
      limit: String(limit),
      offset: String(offset),
      difficulty,
      shuffle: shuffle ? "true" : undefined,
      seed: seed !== undefined ? String(seed) : undefined,
    });
    return safeGet<Question[]>(`/questions?${query}`);
  },

  nextQuestion: (role: string, index = 0, difficulty?: "easy" | "medium" | "hard") => {
    const query = qs({ role, index: String(index), difficulty });
    return safeGet<Question>(`/question/next?${query}`);
  },

  randomQuestion: (role: string, difficulty?: "easy" | "medium" | "hard", seed?: number) => {
    const query = qs({
      role,
      difficulty,
      seed: seed !== undefined ? String(seed) : undefined,
    });
    return safeGet<Question>(`/questions/random?${query}`);
  },

  search: (q: string, opts?: { role?: string; limit?: number }) => {
    const query = qs({
      q,
      role: opts?.role,
      limit: opts?.limit ? String(opts.limit) : undefined,
    });
    return safeGet<Question>(`/search?${query}`);
  },

  // Attempts
  getAttempts: (params?: { role?: string; limit?: number }) => {
    const query = qs({
      role: params?.role,
      limit: params?.limit ? String(params.limit) : undefined,
    });
    const path = query ? `/attempts?${query}` : "/attempts";
    return safeGet<Attempt[]>(path);
  },

  createAttempt: (payload: AttemptCreate) => {
    return safePost<Attempt>("/attempts", payload);
  },

  exportAttemptsCSV: () => `${API_BASE}/attempts/export.csv`,
  exportAttemptsJSON: () => `${API_BASE}/attempts/export.json`,
  clearAttempts: async () => {
    const res = await fetch(`${API_BASE}/attempts`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to clear attempts");
    return true;
  },
  
};
