"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Sparkles, Info, Keyboard, RefreshCw,
  ChevronRight, ChevronLeft, Loader2,
  CheckCircle2, X, Star, StarOff, Copy,
  Volume2, VolumeX, Timer, StickyNote,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Textarea } from "@/components/ui/Textarea";


import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import AudioRecorder from "@/components/AudioRecorder";
import RoleSelect from "@/components/RoleSelect";
import DifficultySelect from "@/components/DifficultySelect";
import ShuffleToggle from "@/components/ShuffleToggle";
import { api, Question, type AttemptCreate } from "@/lib/api";
import { Card } from "@/components/Card";
import { useInterviewStore, Difficulty } from "@/store/interview";
import {
  isBookmarked as checkBM,
  upsertBookmark,
  removeBookmark,
} from "@/lib/bookmarks";
import { getNote, setNote, exportNotesCSV } from "@/lib/notes";


/* ---------- small utils ---------- */
function pad(n: number) { return n < 10 ? `0${n}` : String(n); }
function fmtMMSS(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${pad(mm)}:${pad(ss)}`;
}
const PREFS_KEY = "interview:prefs";

type Prefs = {
  role?: string;
  difficulty?: Difficulty;
  shuffle?: boolean;
  tts?: boolean;
  qSecs?: 0 | 15 | 30 | 60;
};
type AnalysisResult = {
  ok?: boolean;
  id?: string;
  session_id?: string;
  model?: string;
  created?: string;

  // fields used by the UI
  score: number;               // 0..100
  keywords: string[];
  key_phrases: string[];
  summary?: string;
  rationale?: string;
};

export default function InterviewPage() {
  const router = useRouter();
  const search = useSearchParams();
  const focusId = search.get("focus") || undefined;
  const roleParam = search.get("role") || undefined;

  // local roles (from API)
  const [roles, setRoles] = useState<string[]>([]);

  // global interview state (zustand)
  const role = useInterviewStore((s) => s.role);
  const difficulty = useInterviewStore((s) => s.difficulty);
  const shuffle = useInterviewStore((s) => s.shuffle);
  const bank = useInterviewStore((s) => s.bank);
  const index = useInterviewStore((s) => s.index);
  const loading = useInterviewStore((s) => s.loading);
  const error = useInterviewStore((s) => s.error);

  const setRole = useInterviewStore((s) => s.setRole);
  const setDifficulty = useInterviewStore((s) => s.setDifficulty);
  const setShuffle = useInterviewStore((s) => s.setShuffle);
  const setBank = useInterviewStore((s) => s.setBank);
  const setIndex = useInterviewStore((s) => s.setIndex);
  const setLoading = useInterviewStore((s) => s.setLoading);
  const setError = useInterviewStore((s) => s.setError);
  const next = useInterviewStore((s) => s.next);
  const resetStore = useInterviewStore((s) => s.reset);

  /* ------ persisted preferences ------ */
  const [prefs, setPrefs] = useState<Prefs>({ qSecs: 0, tts: false });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Prefs;
        setPrefs((prev) => ({ ...prev, ...p }));
        if (!role && p.role) setRole(p.role);
        if (p.difficulty !== undefined) setDifficulty(p.difficulty);
        if (typeof p.shuffle === "boolean") setShuffle(p.shuffle);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Allow deep link role override
  useEffect(() => {
    if (roleParam) setRole(roleParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleParam]);

  useEffect(() => {
    try {
      localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({ role, difficulty, shuffle, tts: prefs.tts, qSecs: prefs.qSecs ?? 0 })
      );
    } catch {}
  }, [role, difficulty, shuffle, prefs.tts, prefs.qSecs]);

  // Track session time
  const startedAtRef = useRef<number>(Date.now());
  const [now, setNow] = useState<number>(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = now - startedAtRef.current;

  // per-question countdown
  const endRef = useRef<number | null>(null);
  const remaining = prefs.qSecs ? Math.max(0, (endRef.current ?? Date.now()) - now) : 0;

  useEffect(() => {
    if (!prefs.qSecs || loading || !bank.length) return;
    if (remaining === 0 && endRef.current) {
      next();
      endRef.current = Date.now() + prefs.qSecs * 1000;
      toast.message("Auto next", { description: `#${index + 2} of ${bank.length}` });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, prefs.qSecs, bank.length, loading]);

  // load roles once
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await api.roles();
        if (alive) setRoles(r);
      } catch {
        if (alive) {
          const msg = "Failed to load roles. Is the backend running on :8000?";
          setError(msg);
          toast.error(msg);
        }
      }
    })();
    return () => { alive = false; };
  }, [setError]);

  // fetch bank whenever filters change
  const fetchBank = useCallback(async () => {
    if (!role) return;
    setLoading(true);
    setError(null);
    try {
      const list = await api.questions({
        role,
        limit: 50,
        difficulty: (difficulty || undefined) as "easy" | "medium" | "hard" | undefined,
        shuffle,
      });

      const useList = (list.length === 0 && difficulty)
        ? await api.questions({ role, limit: 50, shuffle })
        : list;

      setBank(useList);
      setIndex(0);
      toast.success(`Loaded ${useList.length} question${useList.length === 1 ? "" : "s"}.`);

      startedAtRef.current = Date.now();
      setNow(Date.now());
      if (prefs.qSecs) endRef.current = Date.now() + prefs.qSecs * 1000;

    } catch {
      setError("Could not fetch questions.");
      toast.error("Could not fetch questions.");
    } finally {
      setLoading(false);
    }
  }, [role, difficulty, shuffle, setBank, setIndex, setError, setLoading, prefs.qSecs]);

  useEffect(() => { fetchBank(); }, [fetchBank]);

  // derived current
  const current: Question | null = useMemo(() => bank[index] ?? null, [bank, index]);

  // jump to focus= question id (deep link)
  useEffect(() => {
    if (!focusId || !bank.length) return;
    const i = bank.findIndex((q) => q.id === focusId);
    if (i >= 0) setIndex(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, bank.length]);

  /* ---------------- Bookmarks ---------------- */
  const bookmarked = checkBM(current?.id);

  function toggleBookmark() {
    if (!current) return;
    if (bookmarked) {
      removeBookmark(current.id);
      toast("Removed bookmark");
    } else {
      upsertBookmark({
        id: current.id,
        role: current.role,
        text: current.text,
        topic: current.topic ?? null,
        difficulty: (current.difficulty as any) ?? null,
        created: Date.now(),
      });
      toast("Bookmarked");
    }
  }

  /* ---------------- TTS ---------------- */
  function speak(text?: string) {
    if (!text) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      toast.error("Speech not supported");
      return;
    }
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }
  function cancelSpeech() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }
  useEffect(() => {
    if (!prefs.tts) return;
    if (current?.text) speak(current.text);
    return () => cancelSpeech();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, current?.id, prefs.tts]);

  /* ---------------- Notes ---------------- */
  const [notesOpen, setNotesOpen] = useState(false);
  const [note, setNoteState] = useState("");
  // load note on question change
  useEffect(() => {
    setNoteState(getNote(current?.id));
  }, [current?.id]);
  // debounce save
  useEffect(() => {
    if (!current?.id) return;
    const id = setTimeout(() => setNote(current.id!, note), 300);
    return () => clearTimeout(id);
  }, [note, current?.id]);

  // keyboard
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (loading || !bank.length) return;
      if (["n", "N", "ArrowRight"].includes(e.key)) {
        e.preventDefault(); cancelSpeech();
        next(); if (prefs.qSecs) endRef.current = Date.now() + prefs.qSecs * 1000;
        toast.message("Next question", { description: `#${index + 2} of ${bank.length}` });
      } else if (["p", "P", "ArrowLeft"].includes(e.key)) {
        e.preventDefault(); cancelSpeech();
        setIndex((index - 1 + bank.length) % bank.length);
        if (prefs.qSecs) endRef.current = Date.now() + prefs.qSecs * 1000;
        toast.message("Previous question", { description: `#${index} of ${bank.length}` });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, bank.length, next, index, setIndex, prefs.qSecs]);

  // reset session
  const onReset = useCallback(() => {
    cancelSpeech();
    resetStore();
    fetchBank();
    toast.info("Session reset");
  }, [resetStore, fetchBank]);

  // ---------- Complete/Save flow ----------
  const [completeOpen, setCompleteOpen] = useState(false);
  const [score, setScore] = useState(75);
  // === Transcript & Analysis state ===
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);
  const [lastMeta, setLastMeta] = useState<{ filename?: string; size_bytes?: number; content_type?: string } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [sessionId] = useState(() => crypto.randomUUID());

  // Optional: pass a question/rubric to improve the relevance score
  const [context, setContext] = useState("");

  const tryPrev = () => {
    cancelSpeech();
    setIndex((index - 1 + bank.length) % bank.length);
    if (prefs.qSecs) endRef.current = Date.now() + prefs.qSecs * 1000;
  };

  function scorePill(n: number) {
    return n >= 80
      ? "bg-emerald-500/15 text-emerald-700 ring-emerald-400/30 dark:text-emerald-200"
      : n >= 50
      ? "bg-amber-500/15 text-amber-700 ring-amber-400/30 dark:text-amber-200"
      : "bg-rose-500/15 text-rose-700 ring-rose-400/30 dark:text-rose-200";
  }

  async function saveAttempt() {
    if (!role) { toast.error("Pick a role first"); return; }
    const minutes = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 60000));
    const payload: AttemptCreate = {
      role,
      score,
      duration_min: minutes,
      difficulty: (difficulty || undefined) as any,
      // omit date -> server sets UTC now()
    };

    try {
      await api.createAttempt(payload);
      toast.success("Session saved");
      setCompleteOpen(false);
      resetStore();
      router.push("/dashboard");
    } catch { toast.error("Failed to save session"); }
  }

  async function sendRecordingToBackend(file: File) {
    setUploadError(null);
    setLastTranscript(null);
    setAnalysis(null); // clear any previous analysis when uploading a new answer

    const form = new FormData();
    form.append("file", file, file.name);

    // Call your Next.js route handler (server proxy) — no headers here
    const res = await fetch("/api/transcribe", { method: "POST", body: form });

    if (!res.ok) {
      const text = await res.text();
      setUploadError(`Upload failed (${res.status}): ${text}`);
      throw new Error(`Upload failed (${res.status}): ${text}`);
    }

    const json = await res.json();
    // Expecting { transcript, filename, size_bytes, content_type, id? }
    setLastTranscript(json?.transcript || "");
    setLastMeta({
      filename: json?.filename,
      size_bytes: json?.size_bytes,
      content_type: json?.content_type,
    });
    return json;
  }

  async function analyzeTranscript() {
    if (!lastTranscript) return;
    setAnalyzing(true);
    setAnalysisError(null);
    setAnalysis(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: lastTranscript,
          context,            // optional rubric/question
          session_id: sessionId,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Analyze failed (${res.status}): ${t}`);
      }
      const json = await res.json();
      setAnalysis(json);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setAnalysisError(msg || "Analyze failed");
    } finally {
      setAnalyzing(false);
    }
  }

  function copyQuestion() {
    if (!current?.text) return;
    navigator.clipboard.writeText(current.text).then(
      () => toast.success("Copied"),
      () => toast.error("Copy failed")
    );
  }
  function setCountdown(sec: 0 | 15 | 30 | 60) {
    setPrefs((p) => ({ ...p, qSecs: sec }));
    endRef.current = sec ? Date.now() + sec * 1000 : null;
  }
  // NOTE: removed manual DOM width tweaker; Tailwind + style handles progress width.

  return (
    <main className="min-h-screen overflow-x-hidden">
      <section className="mx-auto max-w-5xl px-4 py-10 md:py-14">
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <Sparkles className="h-5 w-5 shrink-0 text-accent-400" />
          <h1 className="text-2xl font-semibold text-foreground">Mock Interview</h1>
        </div>

        <p className="text-sm text-muted-foreground">
          Pick a role, tweak difficulty, and practice. Your questions load from your local API.
        </p>

        {/* controls bar - responsive, no overflow */}
        <div className="mt-6 flex flex-wrap items-end gap-4">
          <div className="flex-[2_1_16rem] min-w-[240px] min-h-[40px]">
            <RoleSelect
              roles={roles}
              value={role}
              onChange={(r) => { setRole(r); toast.success(`Role: ${r}`); }}
            />
          </div>
          <div className="flex-[1_1_12rem] min-w-[180px] min-h-[40px]">
            <DifficultySelect value={difficulty as Difficulty} onChange={setDifficulty} />
          </div>
          <div className="flex-[0_0_auto] min-h-[40px]">
            <ShuffleToggle
              checked={shuffle}
              onChange={(v) => { setShuffle(v); toast.message(v ? "Shuffle on" : "Shuffle off"); }}
            />
          </div>
        </div>

        {/* secondary toolbar */}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <button
            onClick={() => {
              const on = !prefs.tts;
              setPrefs((p) => ({ ...p, tts: on }));
              if (on && current?.text) speak(current.text);
              if (!on) cancelSpeech();
            }}
            className={[
              "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 focus-ring whitespace-nowrap",
              prefs.tts
                ? "bg-brand-500/15 text-foreground ring-1 ring-brand-500/30"
                : "bg-secondary text-foreground/80 hover:bg-secondary/80 border border-border"
            ].join(" ")}
            title="Toggle speech"
          >
            {prefs.tts ? <Volume2 className="h-4 w-4 shrink-0" /> : <VolumeX className="h-4 w-4 shrink-0" />}
            Speak
          </button>

          <button
            onClick={copyQuestion}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-1.5 text-foreground/80 hover:bg-secondary/80 focus-ring whitespace-nowrap"
            title="Copy question"
          >
            <Copy className="h-4 w-4 shrink-0" />Copy Ques.
          </button>

          <button
            onClick={() => setNotesOpen((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-1.5 text-foreground/80 hover:bg-secondary/80 focus-ring whitespace-nowrap"
            title="Notes"
          >
            <StickyNote className="h-4 w-4 shrink-0" /> Notes
          </button>

          <div className="mx-2 h-4 w-px bg-border" />

          <div className="inline-flex flex-wrap items-center gap-1">
            <Timer className="h-4 w-4 opacity-80 shrink-0" />
            <span className="text-muted-foreground">Auto-next:</span>
            {([0, 15, 30, 60] as const).map((sec) => (
              <button
                key={sec}
                onClick={() => setCountdown(sec)}
                className={[
                  "rounded-lg border px-2 py-1 text-xs focus-ring whitespace-nowrap",
                  prefs.qSecs === sec
                    ? "border-brand-500/30 bg-brand-500/15 text-foreground"
                    : "border-border bg-secondary text-foreground/80 hover:bg-secondary/80",
                ].join(" ")}
              >
                {sec === 0 ? "off" : `${sec}s`}
              </button>
            ))}
            {prefs.qSecs ? (
              <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-xs text-foreground/80">
                {fmtMMSS(remaining)}
              </span>
            ) : null}
          </div>
        </div>

        {/* errors */}
        {error && (
          <div
            className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border p-4 text-sm
                       border-destructive/40 bg-destructive/10 text-destructive-foreground"
            role="alert"
          >
            <Info className="h-4 w-4 shrink-0" />
            <span className="min-w-0 break-words">{error}</span>
          </div>
        )}

        {!role && (
          <Card>
            <div className="flex items-start gap-3">
              <Keyboard className="h-5 w-5 text-brand-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-medium text-foreground">Choose a role to begin</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Tip: use <kbd className="rounded bg-muted px-1">P</kbd> /
                  <kbd className="rounded bg-muted px-1">N</kbd> or
                  <kbd className="rounded bg-muted px-1">←</kbd>
                  <kbd className="rounded bg-muted px-1">→</kbd> to switch.
                </p>
              </div>
            </div>
          </Card>
        )}

        {!loading && role && bank.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">Try another difficulty or enable Shuffle.</p>
        )}

        {role && (
          <div className="card p-6 mt-6">
            <div className="flex flex-col gap-4">
              <div className="min-w-0 flex-1">
                <p
                  aria-live="polite"
                  className="text-xs uppercase tracking-wide text-brand-700/80 dark:text-brand-300/80"
                >
                  Question {bank.length ? index + 1 : 0}{bank.length ? ` of ${bank.length}` : ""}
                </p>

                <div className="mt-1 min-h-[92px] md:min-h-[112px] lg:min-h-[124px] flex items-start">
                  <div aria-live="polite" aria-atomic="true" className="w-full min-w-0">
                    <AnimatePresence mode="wait">
                      <motion.h3
                        key={bank.length ? (bank[index]?.id ?? index) : "empty"}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.18 }}
                        className="text-2xl md:text-3xl font-semibold tracking-tight leading-tight text-foreground break-words hyphens-auto max-w-full"
                      >
                        {loading ? (
                          <span className="inline-flex items-center gap-2 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin shrink-0" /> Loading…
                          </span>
                        ) : (
                          current?.text ?? "No questions."
                        )}
                      </motion.h3>
                    </AnimatePresence>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {current?.topic && <Badge variant="neutral">Topic: {current.topic}</Badge>}
                  {current?.difficulty && (
                    <span
                      className={[
                        "inline-flex items-center rounded-xl px-2.5 py-1 text-xs ring-1 ring-border",
                        current.difficulty === "easy" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
                        current.difficulty === "medium" && "bg-amber-500/10 text-amber-700 dark:text-amber-200",
                        current.difficulty === "hard" && "bg-rose-500/10 text-rose-700 dark:text-rose-200",
                      ].join(" ")}
                    >
                      Difficulty: {current.difficulty}
                    </span>
                  )}

                  <button
                    onClick={toggleBookmark}
                    className="ml-2 inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-2 py-1 text-foreground/80 hover:bg-secondary/80 focus-ring whitespace-nowrap"
                    title={bookmarked ? "Remove bookmark" : "Bookmark this question"}
                  >
                    {bookmarked ? <Star className="h-4 w-4 text-yellow-500 shrink-0" /> : <StarOff className="h-4 w-4 shrink-0" />}
                    <span className="text-xs">{bookmarked ? "Bookmarked" : "Bookmark"}</span>
                  </button>
                </div>
                
                {/* ---- Audio practice & recording ---- */}
                <div className="mt-4 min-w-0">
                  <AudioRecorder
                    filename={`answer-${current?.id || "untitled"}`}
                    onRecordingComplete={sendRecordingToBackend}
                  />
                </div>
                {/* ---- end recorder block ---- */}
              </div>

              {/* Right-side controls (Prev/Next/Reset) */}
              <div className="flex flex-wrap items-center gap-2 justify-end">
                <Button variant="secondary" onClick={onReset} disabled={loading} title="Clear and refetch" className="inline-flex items-center gap-2 whitespace-nowrap">
                  <RefreshCw className="h-4 w-4" /> Reset
                </Button>
                <Button variant="ghost" onClick={tryPrev} disabled={loading || !bank.length} title="Shortcut: P or ←" className="inline-flex items-center gap-2 whitespace-nowrap">
                  <ChevronLeft className="h-4 w-4" /> Prev
                </Button>
                <Button
                  onClick={() => {
                    cancelSpeech();
                    next();
                    if (prefs.qSecs) endRef.current = Date.now() + prefs.qSecs * 1000;
                    if (bank.length) {
                      toast.message("Next question", { description: `#${index + 2} of ${bank.length}` });
                    }
                  }}
                  disabled={loading || !bank.length}
                  className="whitespace-nowrap"
                >
                  <ChevronRight className="h-4 w-4" /> Next
                </Button>
              </div>

              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  role="progressbar"
                  aria-label="Question progress"
                  aria-valuemin={0}
                  aria-valuemax={bank.length ? bank.length : 0}
                  aria-valuenow={bank.length ? Math.min(index + 1, bank.length) : 0}
                  title={`Progress: ${bank.length ? index + 1 : 0} of ${bank.length}`}
                  className="h-2 rounded-full bg-gradient-to-r from-brand-500 to-accent-500 transition-[width] duration-300"
                  style={{ width: bank.length ? `${((index + 1) / bank.length) * 100}%` : "0%" }} />
              </div>

              {/* footer & notes */}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground min-w-0">
                  Session time: {fmtMMSS(elapsed)}
                  {prefs.qSecs ? (
                    <span className="ml-3 inline-flex items-center gap-1 text-foreground/70">
                      <Timer className="h-3 w-3" /> <span>Next in: {fmtMMSS(remaining)}</span>
                    </span>
                  ) : null}
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setNotesOpen((v) => !v)}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-1.5 text-foreground/80 hover:bg-secondary/80 focus-ring whitespace-nowrap"
                    title="Open notes">
                    <StickyNote className="h-4 w-4" /> Notes
                  </button>
                  <button
                    onClick={() => exportNotesCSV()}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-1.5 text-foreground/80 hover:bg-secondary/80 focus-ring whitespace-nowrap"
                    title="Export notes">
                    Export notes
                  </button>

                  {!completeOpen ? (
                    <Button variant="primary" onClick={() => setCompleteOpen(true)} disabled={!role || !bank.length || loading} className="inline-flex items-center gap-2 whitespace-nowrap" title="Save this session">
                      <CheckCircle2 className="h-4 w-4" /> Complete session
                    </Button>
                  ) : (
                    <Button variant="ghost" onClick={() => setCompleteOpen(false)} className="inline-flex items-center gap-2 whitespace-nowrap" title="Cancel">
                      <X className="h-4 w-4" /> Cancel
                    </Button>
                  )}
                </div>
              </div>

              {/* notes panel */}
              {notesOpen && current?.id && (
                <div className="surface p-4 mt-2">
                  <p className="mb-2 text-sm text-muted-foreground">Notes for this question</p>
                  <Textarea
                    value={note}
                    onChange={(e) => setNoteState(e.target.value)}
                    placeholder="Write your thoughts, structure, hints…"
                    className="min-h-[120px] w-full"
                  />
                </div>
              )}

              {/* ---- Transcript & Analysis UI ---- */}
              {uploadError && (
                <div className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 break-words">
                  {uploadError}
                </div>
              )}

              {lastTranscript !== null && (
                <div className="surface p-4 mt-2 space-y-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>Latest transcript</span>
                    {lastMeta && (
                      <span className="rounded bg-muted px-2 py-0.5 text-xs break-all">
                        {lastMeta.filename} • {lastMeta.content_type} • {Math.round(((lastMeta.size_bytes || 0) / 1024) * 10) / 10} KB
                      </span>
                    )}
                  </div>

                  {/* transcript text */}
                  <Textarea
                    defaultValue={lastTranscript || ""}
                    className="min-h-[160px] w-full"
                    aria-label="Transcript"
                  />

                  {/* optional: context/rubric to improve relevance scoring */}
                  <input
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    placeholder="Optional: paste the question or rubric for relevance scoring"
                    className="mt-2 w-full rounded border px-3 py-2 text-sm"
                    aria-label="Analysis context"
                  />

                  {/* analyze button + error */}
                  <div className="flex flex-wrap items-center gap-3 mt-1">
                    <button
                      onClick={analyzeTranscript}
                      disabled={analyzing || !lastTranscript}
                      className="rounded-lg border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50 whitespace-nowrap"
                    >
                      {analyzing ? "Analyzing…" : "Analyze with GPT-4"}
                    </button>
                    {analysisError && <span className="text-sm text-red-600 break-words">{analysisError}</span>}
                  </div>

                  {/* analysis results */}
                  {analysis && (
                    <div className="rounded-lg border p-3 mt-2 overflow-hidden">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="text-sm text-muted-foreground">Relevance score</span>
                        <span className="rounded bg-muted px-2 py-0.5 text-xs">{analysis.score}/100</span>
                      </div>

                      <div className="w-full h-2 bg-muted rounded">
                        <div
                          className="h-2 rounded bg-blue-500"
                          style={{ width: `${Math.max(0, Math.min(100, analysis.score || 0))}%` }}
                        />
                      </div>

                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div>
                          <div className="text-sm font-medium mb-1">Keywords</div>
                          <div className="flex flex-wrap gap-2">
                            {(analysis.keywords || []).map((k: string) => (
                              <span key={k} className="rounded bg-muted px-2 py-0.5 text-xs break-words">{k}</span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm font-medium mb-1">Key phrases</div>
                          <div className="flex flex-wrap gap-2">
                            {(analysis.key_phrases || []).map((k: string) => (
                              <span key={k} className="rounded bg-muted px-2 py-0.5 text-xs break-words">{k}</span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {analysis.summary && (
                        <div className="mt-3">
                          <div className="text-sm font-medium mb-1">Summary</div>
                          <p className="text-sm leading-6 break-words">{analysis.summary}</p>
                        </div>
                      )}

                      {analysis.rationale && (
                        <details className="mt-3">
                          <summary className="cursor-pointer text-sm text-muted-foreground">Model rationale</summary>
                          <p className="mt-2 text-sm leading-6 whitespace-pre-wrap break-words">{analysis.rationale}</p>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              )}
              {/* ---- end transcript & analysis UI ---- */}

              {completeOpen && (
                <div className="surface p-4 mt-2">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">Set your score</p>
                      <p className="text-xs text-muted-foreground">Move the slider and click Save</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={`inline-flex items-center rounded-lg px-2 py-1 text-xs ring-1 ${scorePill(score)}`}>{score}</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={score}
                        onChange={(e) => setScore(parseInt(e.target.value))}
                        className="w-48 accent-brand-500"
                      />
                      <Button onClick={saveAttempt} className="ml-1 whitespace-nowrap">Save</Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
