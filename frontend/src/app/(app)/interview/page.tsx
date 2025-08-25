"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Sparkles,
  Info,
  Keyboard,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import RoleSelect from "@/components/RoleSelect";
import DifficultySelect from "@/components/DifficultySelect";
import ShuffleToggle from "@/components/ShuffleToggle";
import { api, Question, type AttemptCreate } from "@/lib/api";
import { Card } from "@/components/Card";
import { useInterviewStore, Difficulty } from "@/store/interview";

/* ---------- small utils ---------- */
function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}
function fmtMMSS(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${pad(mm)}:${pad(ss)}`;
}
const PREFS_KEY = "interview:prefs";

export default function InterviewPage() {
  const router = useRouter();

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

  // Track session start (for duration)
  const startedAtRef = useRef<number>(Date.now());
  const [now, setNow] = useState<number>(Date.now());

  // live timer tick
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);
  const elapsed = now - startedAtRef.current;

  // restore persisted prefs (role/difficulty/shuffle)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as { role?: string; difficulty?: Difficulty; shuffle?: boolean };
      if (p.role) setRole(p.role);
      if (p.difficulty !== undefined) setDifficulty(p.difficulty);
      if (typeof p.shuffle === "boolean") setShuffle(p.shuffle);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // persist on change
  useEffect(() => {
    try {
      localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({ role, difficulty, shuffle })
      );
    } catch {}
  }, [role, difficulty, shuffle]);

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
    return () => {
      alive = false;
    };
  }, [setError]);

  // fetch question bank on filter changes
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

      if (list.length === 0 && difficulty) {
        // fallback to all difficulties when filtered result is empty
        const all = await api.questions({ role, limit: 50, shuffle });
        setBank(all);
        setIndex(0);
        toast.info("No questions for that difficulty — showing all.");
      } else {
        setBank(list);
        setIndex(0);
        toast.success(`Loaded ${list.length} question${list.length === 1 ? "" : "s"}.`);
      }

      // reset session start time whenever we (re)load a bank
      startedAtRef.current = Date.now();
      setNow(Date.now());
    } catch {
      setError("Could not fetch questions.");
      toast.error("Could not fetch questions.");
    } finally {
      setLoading(false);
    }
  }, [role, difficulty, shuffle, setBank, setIndex, setError, setLoading]);

  useEffect(() => {
    fetchBank();
  }, [fetchBank]);

  // derived current
  const current: Question | null = useMemo(() => bank[index] ?? null, [bank, index]);

  // keyboard shortcuts: N/→ next, P/← prev
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (loading || !bank.length) return;
      if (e.key === "n" || e.key === "N" || e.key === "ArrowRight") {
        e.preventDefault();
        next();
        toast.message("Next question", { description: `#${index + 2} of ${bank.length}` });
      } else if (e.key === "p" || e.key === "P" || e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex((index - 1 + bank.length) % bank.length);
        toast.message("Previous question", { description: `#${index} of ${bank.length}` });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [loading, bank.length, next, index, setIndex, bank.length]);

  // reset flow
  const onReset = useCallback(() => {
    resetStore();
    fetchBank();
    toast.info("Session reset");
  }, [resetStore, fetchBank]);

  // ---------- Complete/Save flow ----------
  const [completeOpen, setCompleteOpen] = useState(false);
  const [score, setScore] = useState(75);
  const tryPrev = () => setIndex((index - 1 + bank.length) % bank.length);

  function scorePill(n: number) {
    return n >= 80
      ? "bg-emerald-500/15 text-emerald-300 ring-emerald-400/20"
      : n >= 50
      ? "bg-amber-500/15 text-amber-300 ring-amber-400/20"
      : "bg-rose-500/15 text-rose-300 ring-rose-400/20";
  }

  async function saveAttempt() {
    if (!role) {
      toast.error("Pick a role first");
      return;
    }
    const minutes = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 60000));
    const payload: AttemptCreate = {
      role,
      score,
      duration_min: minutes,
      date: new Date().toISOString(),
      difficulty: (difficulty || undefined) as "easy" | "medium" | "hard" | undefined, // NEW
    };
    try {
      await api.createAttempt(payload);
      toast.success("Session saved");
      setCompleteOpen(false);
      resetStore();
      router.push("/dashboard");
    } catch (e) {
      toast.error("Failed to save session");
    }
  }

  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-5xl px-4 py-10 md:py-14">
        <div className="mb-6 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-accent-400" />
          <h1 className="text-2xl font-semibold">Mock Interview</h1>
        </div>

        <p className="text-muted-foreground">
          Pick a role, tweak difficulty, and practice. Your questions load from your local API.
        </p>

        {/* controls bar */}
        <div className="mt-6 grid gap-4 md:grid-cols-[2fr_1fr_auto]">
          <RoleSelect
            roles={roles}
            value={role}
            onChange={(r) => {
              setRole(r);
              toast.success(`Role: ${r}`);
            }}
          />
          <DifficultySelect value={difficulty as Difficulty} onChange={setDifficulty} />
          <div className="flex items-end">
            <ShuffleToggle
              checked={shuffle}
              onChange={(v) => {
                setShuffle(v);
                toast.message(v ? "Shuffle on" : "Shuffle off");
              }}
            />
          </div>
        </div>

        {/* errors */}
        {error && (
          <div
            className="mt-4 flex items-center gap-3 rounded-2xl border p-4 text-sm
                       border-rose-200/60 bg-rose-50 text-rose-700
                       dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
            role="alert"
          >
            <Info className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}

        {/* empty state */}
        {!role && (
          <Card>
            <div className="flex items-start gap-3">
              <Keyboard className="h-5 w-5 text-brand-300 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Choose a role to begin</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Tip: use <kbd className="rounded bg-black/10 px-1 dark:bg-white/10">P</kbd>{" "}
                  / <kbd className="rounded bg-black/10 px-1 dark:bg-white/10">N</kbd> or{" "}
                  <kbd className="rounded bg-black/10 px-1 dark:bg-white/10">←</kbd>{" "}
                  <kbd className="rounded bg-black/10 px-1 dark:bg-white/10">→</kbd> to switch.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* suggestion when no questions are found */}
        {!loading && role && bank.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            Try another difficulty or enable Shuffle.
          </p>
        )}

        {/* question card */}
        {role && (
          <div className="mt-6 rounded-2xl border border-black/10 bg-white p-6 shadow-soft dark:border-white/10 dark:bg-white/5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p
                  aria-live="polite"
                  className="text-xs uppercase tracking-wide text-brand-600/80 dark:text-brand-300/80"
                >
                  Question {bank.length ? index + 1 : 0}
                  {bank.length ? ` of ${bank.length}` : ""}
                </p>

                {/* Question block with fixed min height for readability */}
                <div className="mt-1 min-h-[92px] md:min-h-[112px] lg:min-h-[124px] flex items-start">
                  <div aria-live="polite" aria-atomic="true" className="w-full">
                    <AnimatePresence mode="wait">
                      <motion.h3
                        key={bank.length ? (bank[index]?.id ?? index) : "empty"}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.18 }}
                        className="text-2xl md:text-3xl font-semibold tracking-tight leading-tight text-white
                                   drop-shadow-[0_1px_0_rgba(0,0,0,0.32)] dark:text-white"
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

                {/* chips */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {current?.topic && <Badge variant="neutral">Topic: {current.topic}</Badge>}
                  {current?.difficulty && (
                    <span
                      className={[
                        "inline-flex items-center rounded-xl px-2.5 py-1 text-xs ring-1",
                        current.difficulty === "easy" &&
                          "bg-emerald-500/15 text-emerald-700 ring-emerald-400/30 dark:text-emerald-200",
                        current.difficulty === "medium" &&
                          "bg-amber-500/15  text-amber-700  ring-amber-400/30  dark:text-amber-200",
                        current.difficulty === "hard" &&
                          "bg-rose-500/15   text-rose-700   ring-rose-400/30    dark:text-rose-200",
                      ].join(" ")}
                    >
                      Difficulty: {current.difficulty}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="secondary"
                  onClick={onReset}
                  disabled={loading}
                  title="Clear and refetch"
                  className="inline-flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reset
                </Button>
                <Button
                  variant="ghost"
                  onClick={tryPrev}
                  disabled={loading || !bank.length}
                  title="Shortcut: P or ←"
                  className="inline-flex items-center gap-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </Button>
                <Button
                  onClick={() => {
                    next();
                    if (bank.length) {
                      toast.message("Next question", {
                        description: `#${index + 2} of ${bank.length}`,
                      });
                    }
                  }}
                  disabled={loading || !bank.length}
                  title="Shortcut: N or →"
                  className="inline-flex items-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  Next
                </Button>
              </div>
            </div>

            {/* progress bar */}
            <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={bank.length || 0}
                aria-valuenow={Math.min(index + 1, bank.length)}
                className="h-full bg-gradient-to-r from-brand-500 to-accent-500 transition-[width] duration-300"
                style={{ width: bank.length ? `${((index + 1) / bank.length) * 100}%` : "0%" }}
              />
            </div>

            {/* Complete Session CTA + panel */}
            <div className="mt-5 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Session time: {fmtMMSS(elapsed)}
              </p>
              {!completeOpen ? (
                <Button
                  variant="primary"
                  onClick={() => setCompleteOpen(true)}
                  disabled={!role || !bank.length || loading}
                  className="inline-flex items-center gap-2"
                  title="Save this session to your history"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Complete session
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  onClick={() => setCompleteOpen(false)}
                  className="inline-flex items-center gap-2"
                  title="Cancel"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
              )}
            </div>

            {completeOpen && (
              <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Set your score</p>
                    <p className="text-xs text-white/60">Move the slider and click Save</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center rounded-lg px-2 py-1 text-xs ring-1 ${scorePill(
                        score
                      )}`}
                    >
                      {score}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={score}
                      onChange={(e) => setScore(parseInt(e.target.value))}
                      className="w-48 accent-brand-500"
                    />
                    <Button onClick={saveAttempt} className="ml-1">
                      Save
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {/* end complete panel */}
          </div>
        )}
      </section>
    </main>
  );
}
