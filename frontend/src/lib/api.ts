// frontend/src/lib/api.ts
import { toast } from "sonner";
// Import types from our new store
import type { InterviewEvent } from "@/store/interview";

/* ---------------- Types ---------------- */

export type Question = {
  id: string;
  role: string;
  text: string;
  topic?: string | null;
  difficulty?: "easy" | "medium" | "hard" | null;
  
  question_type?: "short" | "long";

  source?: "core" | "trainer";
  readonly?: boolean | null;
};

// OLD type, no longer used by the 'start' flow
export type AIQuestionResponse = {
  question: Question;
  type: "question" | "end";
  session_id: string;
  final_summary?: string;
};

// NEW: This is the response from a 'start' call
export type AIStartResponse = {
  questions: Question[];
  session_id: string;
};

// This is the result from analyzing a single answer
// This matches the backend model in backend/app/main.py
export type AnalysisResult = {
  id: string;
  session_id: string;
  score: number; // 0-100 (can be relevance_score)
  keywords: string[];
  key_phrases: string[];
  summary: string;
  rationale: string; // This is the "review"
  model: string;
  created: string;
  
  question_text?: string | null;
  answer_transcript?: string | null;

  relevance_score?: number;
  matched_points?: string[];
  missed_points?: string[];
};

// NEW: Transcript response from our /api/transcribe endpoint
export type TranscribeResult = {
  ok: boolean;
  id: string;
  transcript: string;
  filename: string;
  size_bytes: number;
  content_type: string;
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

  mode?: "open" | "protected";
  questions_size?: number;
  attempts_size?: number;
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
const AI_TIMEOUT = 30_000;
const DEFAULT_RETRY = 1;

/* ---------------- Helpers ---------------- */

function qs(params: Record<string, string | undefined>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") u.set(k, v);
  }
  return u.toString() ? `?${u.toString()}` : "";
}

function isBrowser() {
  return typeof window !== "undefined";
}

function maybeToast(kind: "error" | "warning", message: string, description?: string) {
  if (!isBrowser()) return;
  if (kind === "error") toast.error(message, description ? { description } : undefined);
  else toast(message, description ? { description } : undefined);
}

function fetchWithTimeout(
  url: string,
  opts: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT
) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  const p = fetch(url, { ...opts, signal: ctrl.signal })
    .catch((e) => {
      const name = (e && (e.name || e.code)) || "";
      if (name === "AbortError" || name === "TimeoutError") {
        maybeToast("error", "Request timed out", "Please try again.");
        const err = new Error("Request timed out");
        (err as any).code = "TIMEOUT";
        throw err;
      }
      maybeToast("error", "Network error", "Check your connection and try again.");
      const err = new Error("Network error");
      (err as any).code = "NETWORK";
      throw err;
    })
    .finally(() => clearTimeout(id));

  return p.finally(() => clearTimeout(id));
}


async function toError(res: Response): Promise<Error> {
  let detail: string | undefined;
  try {
    const text = await res.text();
    if (text) {
      try {
        const j = JSON.parse(text);
        detail =
          (Array.isArray(j?.detail) && j.detail[0]?.msg) ||
          j?.detail ||
          j?.error ||
          j?.message ||
          text;
      } catch {
        detail = text;
      }
    }
  } catch {}

  const status = res.status;
  const rid = res.headers.get("x-request-id") || "";

  if (status === 429) {
    maybeToast("error", "Too many requests", rid ? `Request ID: ${rid}` : "Please slow down and try again.");
  } else if (status === 502 || status === 503 || status === 504) {
    maybeToast("error", "Backend unavailable", rid ? `Request ID: ${rid}` : "Please try again shortly.");
  } else if (status === 401) {
    maybeToast("error", "Unauthorized", "Your session or API key is invalid.");
  } else if (status === 404) {
    maybeToast("error", "Not found", "The resource you requested does not exist.");
  } else if (status === 422) {
    maybeToast("error", "Validation failed", detail || "Please check your input and try again.");
  } else if (status >= 500) {
    maybeToast("error", "Server error", rid ? `Request ID: ${rid}` : "Please try again.");
  }

  const err = new Error(detail || `Request failed: ${status}`);
  (err as any).status = status;
  if (rid) (err as any).requestId = rid;
  return err;
}

/** small safe toast helper (avoids SSR issues) */
function toastSafe(kind: "success" | "error" | "message", text: string) {
  if (typeof window === "undefined") return;
  import("sonner").then(({ toast }) => {
    if (kind === "success") toast.success(text);
    else if (kind === "error") toast.error(text);
    else toast(text);
  }).catch(() => {});
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
      const txt = await res.text();
      try {
        return JSON.parse(txt) as T;
      } catch {
        throw new Error(`Unexpected non-JSON response: ${txt}`);
      }
    }

    if (res.status === 429) {
      toastSafe("error", "Too many requests — please slow down.");
    } else if (res.status === 502 || res.status === 503 || res.status === 504) {
      toastSafe("error", "Backend unavailable — try again in a moment.");
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
    getProfile: (email: string) =>
      request<{ role: string | null }>(p("/auth/role"), {
        query: { email },
      }),
  },

  /* Admin endpoints */
  admin: {
    listUsers: () => request<AdminUser[]>(p("/admin/users")),

    updateUserRole: (email: string, role: "Student" | "Trainer" | "Admin" | null) =>
      request<AdminUser>(p("/admin/users"), {
        method: "PATCH",
        body: { email, role },
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
          difficulty: params?.difficulty ?? undefined,
      
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

  // NEW: All interview-flow APIs
  interview: {
    /**
     * Starts a new interview session.
     */
    start: async (
      role: string,
      interviewType: "technical" | "hr",
      resumeFile: File
    ): Promise<AIStartResponse> => { // MODIFIED Return Type
      const formData = new FormData();
      formData.append("role", role);
      formData.append("interview_type", interviewType);
      formData.append("resume_file", resumeFile);

      const res = await fetchWithTimeout(
        `${API_BASE}${p("/interview/start")}`,
        {
          method: "POST",
          body: formData,
          headers: {
            ...(SHOULD_ATTACH_KEY ? { "x-api-key": API_KEY } : {}),
          },
        },
        AI_TIMEOUT
      );

      if (!res.ok) throw await toError(res);
      return (await res.json()) as AIStartResponse; // MODIFIED Return Type
    },

    /**
     * Gets the next question from the AI. (No longer used in the new flow)
     */
    next: (
      sessionId: string,
      history: InterviewEvent[],
      role: string,
      interviewType: "technical" | "hr"
    ): Promise<AIQuestionResponse> => {
      return request<AIQuestionResponse>(
        p("/interview/next"),
        {
          method: "POST",
          body: { session_id: sessionId, history, role, interview_type: interviewType },
          auth: true,
          timeout: AI_TIMEOUT,
        }
      );
    },
    
    /**
     * NEW: Generates the final report for the entire interview.
     */
    generateReport: (
      sessionId: string,
      history: InterviewEvent[] // This is the history of { question, transcript }
    ): Promise<{ ok: boolean; overall_summary: string }> => {
      return request<{ ok: boolean; overall_summary: string }>(
        p("/interview/generate_report"), // NEW Proxy endpoint
        {
          method: "POST",
          body: {
            session_id: sessionId,
            history: history.map(h => ({
              question_text: h.question.text, // Send just the text
              answer_transcript: h.transcript,
            }))
          },
          auth: true,
          timeout: AI_TIMEOUT * 3, // Give this a long timeout for full analysis
        }
      );
    },

    /**
     * Transcribes an audio file.
     */
    transcribe: async (
      file: File,
      questionId?: string
    ): Promise<TranscribeResult> => {
      const formData = new FormData();
      formData.append("file", file, file.name || "audio.webm");
      
      let urlStr = `${API_BASE}${p("/transcribe")}`;
      if (questionId) {
        urlStr += `?question_id=${encodeURIComponent(questionId)}`;
      }

      const res = await fetchWithTimeout(
        urlStr,
        {
          method: "POST",
          body: formData,
          headers: {
            ...(SHOULD_ATTACH_KEY ? { "x-api-key": API_KEY } : {}),
          },
        },
        AI_TIMEOUT
      );

      if (!res.ok) throw await toError(res);
      return (await res.json()) as TranscribeResult;
    },

    /**
     * Analyzes a transcript against a question. (No longer used in the new flow)
     */
    analyze: (
      transcript: string,
      question: string,
      sessionId: string
    ): Promise<AnalysisResult> => {
      return request<AnalysisResult>(
        p("/analyze_content"),
        {
          method: "POST",
          body: {
            answer_transcript: transcript,
            question: question,
            session_id: sessionId,
          },
          auth: true,
          timeout: AI_TIMEOUT,
        }
      );
    },
  },

  // NEW: API for the report page
  analysis: {
    /**
     * Gets all analysis records for a specific session.
     */
    listBySession: (sessionId: string): Promise<AnalysisResult[]> => {
      return request<AnalysisResult[]>(p("/analysis"), {
        query: { session_id: sessionId, limit: "200" },
        auth: true,
      });
    },
  },
};