export type Question = {
  id: string;
  role: string;
  text: string;
  topic?: string | null;
  difficulty?: string | null;
};

export type Attempt = {
  id: string;
  role: string;
  score: number;
  duration_min: number;
  date: string; // ISO
  difficulty?: "easy" | "medium" | "hard";
};

export type AttemptCreate = {
  role: string;
  score: number;
  duration_min: number;
  date?: string; // optional; server sets if missing
  difficulty?: "easy" | "medium" | "hard";
};

export type AttemptUpdate = Partial<AttemptCreate>;

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

async function safe<T>(p: Promise<Response>): Promise<T> {
  const res = await p;
  if (!res.ok) {
    let msg = `Request failed: ${res.status}`;
    try {
      const j = await res.json();
      if (j?.detail) msg = Array.isArray(j.detail) ? j.detail[0]?.msg || msg : j.detail;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

function qs(params: Record<string, string | undefined>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") u.set(k, v);
  }
  return u.toString();
}

type QuestionsParams = {
  role: string;
  limit?: number;
  offset?: number;
  difficulty?: "easy" | "medium" | "hard";
  shuffle?: boolean;
  seed?: number;
};

export const api = {
  roles: () => safe<string[]>(fetch(`${API_BASE}/roles`, { cache: "no-store" })),

  questions: ({ role, limit = 20, offset = 0, difficulty, shuffle, seed }: QuestionsParams) => {
    const query = qs({
      role,
      limit: String(limit),
      offset: String(offset),
      difficulty,
      shuffle: shuffle ? "true" : undefined,
      seed: seed !== undefined ? String(seed) : undefined,
    });
    return safe<Question[]>(fetch(`${API_BASE}/questions?${query}`, { cache: "no-store" }));
  },

  nextQuestion: (role: string, index = 0, difficulty?: string) => {
    const query = qs({
      role,
      index: String(index),
      difficulty,
    });
    return safe<Question>(fetch(`${API_BASE}/question/next?${query}`, { cache: "no-store" }));
  },

  getAttempts: ({ role, limit = 100 }: { role?: string; limit?: number }) => {
    const query = qs({ role, limit: String(limit) });
    return safe<Attempt[]>(fetch(`${API_BASE}/attempts?${query}`, { cache: "no-store" }));
  },

  createAttempt: (a: AttemptCreate) =>
    safe<Attempt>(
      fetch(`${API_BASE}/attempts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(a),
      })
    ),

  deleteAttempt: (id: string) =>
    safe<{ ok: boolean; deleted: number; id: string }>(
      fetch(`${API_BASE}/attempts/${id}`, { method: "DELETE" })
    ),

  updateAttempt: (id: string, patch: AttemptUpdate) =>
    safe<Attempt>(
      fetch(`${API_BASE}/attempts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
    ),
};
