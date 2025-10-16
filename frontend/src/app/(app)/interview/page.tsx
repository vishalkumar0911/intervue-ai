// src/app/(app)/interview/page.tsx
"use client";

import { needsRoleOnboarding } from "@/lib/rbac";
import { useAuth } from "@/components/auth/AuthProvider";
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
import Link from "next/link";

import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
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
import RequireRole from "@/components/auth/RequireRole";

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

export default function InterviewPage() {
  const { user, loading } = useAuth();
  const isPrivileged = user?.role === "Trainer" || user?.role === "Admin";

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

  useEffect(() => {
    if (!loading && user && needsRoleOnboarding(user)) {
      router.replace("/onboarding?next=/interview");
    }
  }, [loading, user, router]);

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

  return (
    <RequireRole roles={["Student"]} mode="redirect">
      <main className="min-h-screen">
        <section className="mx-auto max-w-5xl px-4 py-10 md:py-14">
          <div className="mb-6 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent-400" />
            <h1 className="text-2xl font-semibold text-foreground">Mock Interview</h1>
          </div>

          <p className="text-sm text-muted-foreground">
            Pick a role, tweak difficulty, and practice. Your questions load from your local API.
          </p>

          {/* controls bar */}
          <div className="mt-6 grid gap-4 md:grid-cols-[2fr_1fr_auto]">
            <RoleSelect
              roles={roles}
              value={role}
              onChange={(r) => { setRole(r); toast.success(`Role: ${r}`); }}
            />
            <DifficultySelect value={difficulty as Difficulty} onChange={setDifficulty} />
            <div className="flex items-end">
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
                "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 focus-ring",
                prefs.tts
                  ? "bg-brand-500/15 text-foreground ring-1 ring-brand-500/30"
                  : "bg-secondary text-foreground/80 hover:bg-secondary/80 border border-border"
              ].join(" ")}
              title="Toggle speech"
            >
              {prefs.tts ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              Speak
            </button>

            <button
              onClick={copyQuestion}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-1.5 text-foreground/80 hover:bg-secondary/80 focus-ring"
              title="Copy question"
            >
              <Copy className="h-4 w-4" />Copy Ques.
            </button>

            <button
              onClick={() => setNotesOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-1.5 text-foreground/80 hover:bg-secondary/80 focus-ring"
              title="Notes"
            >
              <StickyNote className="h-4 w-4" /> Notes
            </button>

            <div className="mx-2 h-4 w-px bg-border" />

            <div className="inline-flex items-center gap-1">
              <Timer className="h-4 w-4 opacity-80" />
              <span className="text-muted-foreground">Auto-next:</span>
              {([0, 15, 30, 60] as const).map((sec) => (
                <button
                  key={sec}
                  onClick={() => setCountdown(sec)}
                  className={[
                    "rounded-lg border px-2 py-1 text-xs focus-ring",
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
              className="mt-4 flex items-center gap-3 rounded-2xl border p-4 text-sm
                         border-destructive/40 bg-destructive/10 text-destructive-foreground"
              role="alert"
            >
              <Info className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}

          {!role && (
            <Card>
              <div className="flex items-start gap-3">
                <Keyboard className="h-5 w-5 text-brand-500 shrink-0 mt-0.5" />
                <div>
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

          {/* >>> Enhanced empty-state (role-aware) <<< */}
          {!loading && role && bank.length === 0 && (
            <Card className="mt-4">
              {isPrivileged ? (
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">No questions found for this filter.</p>
                    <p className="text-sm text-muted-foreground">
                      You can add questions in the Trainer UI.
                    </p>
                    <div className="pt-2">
                      <Link href="/trainer/questions" className="inline-flex">
                        <Button>Go to Trainer Questions</Button>
                      </Link>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-2">
                    <p className="font-medium text-foreground">No questions match your current filters.</p>
                    <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                      <li>Try a different difficulty (or clear difficulty).</li>
                      <li>Toggle shuffle off/on.</li>
                      <li>Pick another role.</li>
                    </ul>
                  </div>
                </div>
              )}
            </Card>
          )}

          {role && (
            <div className="card p-6 mt-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p
                    aria-live="polite"
                    className="text-xs uppercase tracking-wide text-brand-700/80 dark:text-brand-300/80"
                  >
                    Question {bank.length ? index + 1 : 0}{bank.length ? ` of ${bank.length}` : ""}
                  </p>

                  <div className="mt-1 min-h-[92px] md:min-h-[112px] lg:min-h-[124px] flex items-start">
                    <div aria-live="polite" aria-atomic="true" className="w-full">
                      <AnimatePresence mode="wait">
                        <motion.h3
                          key={bank.length ? (bank[index]?.id ?? index) : "empty"}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.18 }}
                          className="text-2xl md:text-3xl font-semibold tracking-tight leading-tight text-foreground"
                        >
                          {loading ? (
                            <span className="inline-flex items-center gap-2 text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
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
                      className="ml-2 inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-2 py-1 text-foreground/80 hover:bg-secondary/80 focus-ring"
                      title={bookmarked ? "Remove bookmark" : "Bookmark this question"}
                    >
                      {bookmarked ? <Star className="h-4 w-4 text-yellow-500" /> : <StarOff className="h-4 w-4" />}
                      <span className="text-xs">{bookmarked ? "Bookmarked" : "Bookmark"}</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="secondary" onClick={onReset} disabled={loading} title="Clear and refetch" className="inline-flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" /> Reset
                  </Button>
                  <Button variant="ghost" onClick={tryPrev} disabled={loading || !bank.length} title="Shortcut: P or ←" className="inline-flex items-center gap-2">
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
                    title="Shortcut: N or →"
                    className="inline-flex items-center gap-2"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />} Next
                  </Button>
                </div>
              </div>

              {/* progress */}
              <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  role="progressbar" aria-valuemin={0} aria-valuemax={bank.length || 0}
                  aria-valuenow={Math.min(index + 1, bank.length)}
                  className="h-full bg-gradient-to-r from-brand-500 to-accent-500 transition-[width] duration-300"
                  style={{ width: bank.length ? `${((index + 1) / bank.length) * 100}%` : "0%" }} />
              </div>

              {/* footer & notes */}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Session time: {fmtMMSS(elapsed)}
                  {prefs.qSecs ? (
                    <span className="ml-3 inline-flex items-center gap-1 text-foreground/70">
                      <Timer className="h-3 w-3" /> <span>Next in: {fmtMMSS(remaining)}</span>
                    </span>
                  ) : null}
                </p>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setNotesOpen((v) => !v)}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-1.5 text-foreground/80 hover:bg-secondary/80 focus-ring"
                    title="Open notes">
                    <StickyNote className="h-4 w-4" /> Notes
                  </button>
                  <button
                    onClick={() => exportNotesCSV()}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-1.5 text-foreground/80 hover:bg-secondary/80 focus-ring"
                    title="Export notes">
                    Export notes
                  </button>

                  {!completeOpen ? (
                    <Button variant="primary" onClick={() => setCompleteOpen(true)} disabled={!role || !bank.length || loading} className="inline-flex items-center gap-2" title="Save this session">
                      <CheckCircle2 className="h-4 w-4" /> Complete session
                    </Button>
                  ) : (
                    <Button variant="ghost" onClick={() => setCompleteOpen(false)} className="inline-flex items-center gap-2" title="Cancel">
                      <X className="h-4 w-4" /> Cancel
                    </Button>
                  )}
                </div>
              </div>

              {/* notes panel */}
              {notesOpen && current?.id && (
                <div className="surface p-4 mt-4">
                  <p className="mb-2 text-sm text-muted-foreground">Notes for this question</p>
                  <Textarea
                    value={note}
                    onChange={(e) => setNoteState(e.target.value)}
                    placeholder="Write your thoughts, structure, hints…"
                    className="min-h-[120px]"
                  />

                </div>
              )}

              {/* complete/save panel */}
              {completeOpen && (
                <div className="surface p-4 mt-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">Set your score</p>
                      <p className="text-xs text-muted-foreground">Move the slider and click Save</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center rounded-lg px-2 py-1 text-xs ring-1 ${scorePill(score)}`}>{score}</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={score}
                        onChange={(e) => setScore(parseInt(e.target.value))}
                        className="w-48 accent-brand-500"
                      />
                      <Button onClick={saveAttempt} className="ml-1">Save</Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </RequireRole>
  );
}
