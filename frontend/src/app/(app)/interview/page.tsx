// frontend/src/app/(app)/interview/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Sparkles, Upload, FileText, AlertTriangle, Timer } from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import RequireRole from "@/components/auth/RequireRole";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/Card";
import RoleSelect from "@/components/RoleSelect";
import { api, Question, TranscribeResult } from "@/lib/api";
import { useInterviewStore } from "@/store/interview";

/*
  Full file focused on fixing:
  - overlapping/duplicated spoken questions
  - "Audio was inaudible" false positives
  - recorded audio not getting transcribed reliably

  Key strategies:
  - Play audio only once per question id on the 'asking' transition
  - Stop playback before starting recorder
  - Ensure recorder flushes final chunks (extra delay) before uploading
  - Retry transcription up to 2x on empty transcript, and show clear "transcription failed" if still empty
  - Provide Play Last Recording button for debugging
*/

/* ------------------------------
   Playback / TTS helpers (module scope)
   ------------------------------ */

// Single HTMLAudioElement currently playing
let __currentAudio: HTMLAudioElement | null = null;
// Promise that resolves when current playback finishes
let __currentAudioPromise: Promise<void> | null = null;
// Track which question IDs have been played this session to avoid duplicate plays
const __playedQuestionIds = new Set<string>();
// Currently playing question id
let __playingQuestionId: string | null = null;

function stopPlayback() {
  try {
    if (__currentAudio) {
      try { __currentAudio.pause(); } catch {}
      try { __currentAudio.currentTime = 0; } catch {}
      try { URL.revokeObjectURL(__currentAudio.src); } catch {}
      __currentAudio = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try { window.speechSynthesis.cancel(); } catch {}
    }
  } finally {
    __currentAudioPromise = null;
    __playingQuestionId = null;
  }
}

/**
 * Play text using server /api/tts and fallback to speechSynthesis.
 * Returns a Promise that resolves when playback ends.
 * If playback is already running, returns the same promise.
 */
async function playQuestionAudio(text: string): Promise<void> {
  if (!text) return;
  if (__currentAudioPromise) return __currentAudioPromise;

  __currentAudioPromise = new Promise<void>(async (resolve) => {
    const finish = () => {
      // small micro-gap before resolving to prevent immediate overlap
      setTimeout(() => {
        __currentAudioPromise = null;
        resolve();
      }, 0);
    };

    // Try server-side TTS proxy
    try {
      const resp = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (resp.ok) {
        try {
          const audioBlob = await resp.blob();
          const url = URL.createObjectURL(audioBlob);
          const audio = new Audio(url);
          __currentAudio = audio;

          const onEnded = () => {
            audio.removeEventListener("ended", onEnded);
            try { URL.revokeObjectURL(url); } catch {}
            __currentAudio = null;
            finish();
          };
          audio.addEventListener("ended", onEnded);

          try {
            await audio.play();
            return; // resolves on 'ended'
          } catch (err) {
            console.warn("[TTS] audio.play() failed; falling back to speechSynthesis", err);
            try { audio.pause(); } catch {}
            try { audio.src = ""; } catch {}
            try { URL.revokeObjectURL(url); } catch {}
            __currentAudio = null;
          }
        } catch (err) {
          console.warn("[TTS] reading audio blob failed, falling back", err);
        }
      } else {
        console.warn("[TTS] proxy returned non-ok:", resp.status);
      }
    } catch (err) {
      console.warn("[TTS] proxy fetch error, falling back:", err);
    }

    // Fallback to browser SpeechSynthesis
    try {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = "en-US";
        utter.rate = 1;
        utter.pitch = 1;
        utter.onend = () => finish();
        utter.onerror = (e) => { console.warn("[TTS] speechSynthesis error", e); finish(); };
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utter);
        return;
      } else {
        console.warn("[TTS] No speechSynthesis available");
      }
    } catch (err) {
      console.warn("[TTS] speechSynthesis failed", err);
    }

    // If everything failed, resolve to keep UI moving
    finish();
  });

  return __currentAudioPromise;
}

/* ------------------------------
   Typewriter component
   ------------------------------ */
function Typewriter({ text, onComplete }: { text: string; onComplete?: () => void | Promise<void> }) {
  const [displayText, setDisplayText] = useState("");
  const indexRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  const chars = useMemo(() => Array.from(text), [text]);

  useEffect(() => {
    // cleanup
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    indexRef.current = 0;
    setDisplayText("");

    if (!chars || chars.length === 0) {
      onComplete?.();
      return;
    }

    // show first char to avoid initial gap
    setDisplayText(chars[0]);
    indexRef.current = 1;

    const perCharDelay = Math.max(20, Math.min(200, Math.round(600 / Math.max(1, chars.length))));

    timerRef.current = window.setInterval(() => {
      if (indexRef.current >= chars.length) {
        if (timerRef.current) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        try {
          const r = onComplete && onComplete();
          if (r && typeof (r as Promise<void>).then === "function") {
            (r as Promise<void>).catch((e) => console.warn("[Typewriter] onComplete error", e));
          }
        } catch (e) {
          console.warn("[Typewriter] onComplete threw", e);
        }
        return;
      }
      const next = chars[indexRef.current];
      setDisplayText((p) => p + next);
      indexRef.current += 1;
    }, perCharDelay);

    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [chars, onComplete]);

  return <p className="text-3xl md:text-4xl font-semibold leading-snug">{displayText}</p>;
}

/* ------------------------------
   Visualizer & Timer
   ------------------------------ */
function AudioWave({ isListening }: { isListening: boolean }) {
  return (
    <div className="relative flex w-full h-24 items-center justify-center overflow-hidden" aria-hidden>
      {isListening ? (
        <div className="flex items-center justify-center gap-1.5 h-full">
          {[...Array(32)].map((_, i) => (
            <motion.div
              key={i}
              className="w-1.5 bg-brand-500"
              initial={{ height: "4px" }}
              animate={{ height: ["4px", "60px", "10px", "4px"] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.05 }}
            />
          ))}
        </div>
      ) : (
        <div className="h-0.5 w-full bg-border" />
      )}
    </div>
  );
}

function CountdownTimer({ duration, onComplete }: { duration: number; onComplete: () => void }) {
  const [remaining, setRemaining] = useState(duration);
  const timerRef = useRef<NodeJS.Timeout>();
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    setRemaining(duration);
    timerRef.current = setInterval(() => {
      setRemaining((prev) => {
        const next = prev - 1000;
        if (next <= 0) {
          if (timerRef.current) clearInterval(timerRef.current);
          onCompleteRef.current();
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [duration]);

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  return (
    <div className="flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-lg font-medium text-muted-foreground">
      <Timer className="h-5 w-5" />
      <span>{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}</span>
    </div>
  );
}

/* ------------------------------
   MinimalAudioRecorder (robust)
   ------------------------------ */
const MinimalAudioRecorder = React.forwardRef<
  { start: () => Promise<void>; stop: () => Promise<File | null> },
  {}
>((_, ref) => {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeTypeRef = useRef<string>("audio/webm");

  const start = async () => {
    stopStream();

    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Media devices not supported");

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 48000,
      },
    });
    streamRef.current = stream;

    const supported = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg"].find((t) => {
      try { return MediaRecorder.isTypeSupported(t); } catch { return false; }
    });
    mimeTypeRef.current = supported || "audio/webm";

    chunksRef.current = [];

    const rec = new MediaRecorder(stream, { mimeType: mimeTypeRef.current });
    mediaRecorderRef.current = rec;

    rec.ondataavailable = (e) => {
      try { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); } catch (err) { console.warn("[recorder] ondataavailable", err); }
    };

    rec.onerror = (ev) => {
      console.error("[recorder] error", ev);
      try { rec.stop(); } catch {}
      stopStream();
    };

    try {
      rec.start();
    } catch (err) {
      stopStream();
      throw new Error("Failed to start recording");
    }

    // Wait until state is "recording" or timeout
    const startTimeoutMs = 5000;
    const startDeadline = Date.now() + startTimeoutMs;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const onStart = () => { if (!settled) { settled = true; try { rec.onstart = null; } catch {} resolve(); } };
      try { rec.onstart = onStart; } catch {}
      const poll = () => {
        if (mediaRecorderRef.current?.state === "recording") { if (!settled) { settled = true; resolve(); return; } }
        if (Date.now() > startDeadline) { if (!settled) { settled = true; reject(new Error("Recording start timeout")); return; } }
        else setTimeout(poll, 100);
      };
      poll();
    });

    // Warm-up gap so some devices flush initial data
    await new Promise((r) => setTimeout(r, 200));
    console.debug("[recorder] started confirmed; mime:", mimeTypeRef.current);
  };

  const stop = (): Promise<File | null> =>
    new Promise((resolve) => {
      const rec = mediaRecorderRef.current;
      if (rec && rec.state === "recording") {
        let finished = false;

        const cleanupAndResolve = async () => {
          if (finished) return;
          finished = true;
          // Give browser time to flush final chunk
          await new Promise((r) => setTimeout(r, 350));
          try {
            const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
            const file = blob.size > 0 ? new File([blob], "interview-answer.webm", { type: mimeTypeRef.current }) : null;
            try { (window as any).__lastRecording = file; } catch {}
            stopStream();
            console.debug("[recorder] stopped; blobSize=", blob.size);
            resolve(file);
          } catch (err) {
            stopStream();
            resolve(null);
          }
        };

        rec.onstop = cleanupAndResolve;
        try { rec.stop(); } catch (e) { console.warn("[recorder] stop() threw", e); cleanupAndResolve(); }
        // Safety timeout
        setTimeout(() => cleanupAndResolve(), 5000);
      } else {
        stopStream();
        resolve(null);
      }
    });

  const stopStream = () => {
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    streamRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  };

  React.useImperativeHandle(ref, () => ({ start, stop }));

  useEffect(() => { return () => stopStream(); }, []);

  return null;
});
MinimalAudioRecorder.displayName = "MinimalAudioRecorder";

/* ------------------------------
   InterviewSession component (main)
   ------------------------------ */
function InterviewSession() {
  const router = useRouter();
  const {
    interviewState,
    currentQuestion,
    sessionId,
    history,
    role,
    attempt,
    allQuestions,
    setState,
    setCurrentQuestion,
    addHistoryEvent,
    setError,
    incrementAttempt,
  } = useInterviewStore();

  const recorderRef = useRef<{ start: () => Promise<void>; stop: () => Promise<File | null> } | null>(null);
  const [lastRecordedFile, setLastRecordedFile] = useState<File | null>(null);

  const listenDuration = useMemo(() => (currentQuestion?.question_type === "short" ? 30000 : 60000), [currentQuestion?.question_type]);
  const INAUDIBLE_THRESHOLD_BYTES = 400; // accept smaller valid files; tuned lower

  // When we enter 'asking', play the question exactly once for that question id.
  useEffect(() => {
    (async () => {
      if (interviewState !== "asking") return;
      if (!currentQuestion) return;

      const qid = currentQuestion.id;
      // If the question was already played this session, skip playing again
      if (qid && __playedQuestionIds.has(qid)) {
        console.debug("[TTS] question already played this session, skipping:", qid);
        return;
      }

      // Stop any existing playback, mark as playing
      stopPlayback();
      __playingQuestionId = qid ?? null;
      if (qid) __playedQuestionIds.add(qid);

      try {
        await playQuestionAudio(currentQuestion.text);
        // playback finished
        __playingQuestionId = null;
      } catch (e) {
        console.warn("[TTS] playback error for question", qid, e);
        __playingQuestionId = null;
      }
    })();
    // only trigger when interviewState or currentQuestion.id changes
  }, [interviewState, currentQuestion?.id, currentQuestion?.text]);

  // Start recorder on 'listening' - always stop playback first
  useEffect(() => {
    if (interviewState === "listening") {
      (async () => {
        try {
          // ensure no TTS playing
          stopPlayback();
          // small settle
          await new Promise((r) => setTimeout(r, 200));
          await recorderRef.current?.start();
          console.debug("[session] recorder started for question", currentQuestion?.id);
        } catch (e) {
          console.error("[session] recorder start failed", e);
          toast.error("Microphone not available. Please allow microphone access and retry.");
          setState("asking");
        }
      })();
    }
  }, [interviewState, currentQuestion?.id]);

  /**
   * handleAudioComplete:
   *  - logs file size
   *  - if file too small -> inaudible
   *  - tries transcription; retries twice on empty result
   *  - if still empty -> "Transcription failed" and let user reattempt
   */
  const handleAudioComplete = async (audioFile: File | null) => {
    console.debug("[session] handleAudioComplete file size:", audioFile?.size ?? null);

    // 1) Basic file size check (true inaudible)
    if (!audioFile || audioFile.size < INAUDIBLE_THRESHOLD_BYTES) {
      console.warn("[session] audio below threshold:", audioFile?.size);
      toast.warning("Audio was inaudible", { description: "Your response was too short. Please try again." });
      incrementAttempt();
      // Re-ask same question
      setState("asking");
      // give a small pause then go to listening so user can reply again
      setTimeout(() => setState("listening"), 2200);
      return;
    }

    if (!currentQuestion || !sessionId) {
      setError("Session error. Please restart.");
      return;
    }

    try {
      setState("processing");

      // Attempt transcription (up to 3 tries total: 1 initial + up to 2 retries if transcript empty)
      let transcribeResult: TranscribeResult | null = null;
      const maxAttempts = 3;
      for (let attemptIdx = 1; attemptIdx <= maxAttempts; attemptIdx++) {
        try {
          console.debug(`[session] transcribe attempt ${attemptIdx} size=${audioFile.size}`);
          transcribeResult = await api.interview.transcribe(audioFile, currentQuestion.id, sessionId);
          console.debug(`[session] transcribe attempt ${attemptIdx} result:`, transcribeResult);
        } catch (tErr) {
          console.error(`[session] transcribe attempt ${attemptIdx} error:`, tErr);
          transcribeResult = transcribeResult ?? null;
        }

        // if we have a non-empty transcript, break
        if (transcribeResult && transcribeResult.transcript && transcribeResult.transcript.trim().length > 0) {
          break;
        }

        // short backoff before retrying (gives server time if it's busy)
        await new Promise((r) => setTimeout(r, 500 * attemptIdx));
      }

      // If even after retries transcript empty -> show "transcription failed"
      if (!transcribeResult || !transcribeResult.transcript || transcribeResult.transcript.trim().length === 0) {
        console.warn("[session] transcript empty after retries");
        toast.error("Transcription failed", { description: "We couldn't transcribe your response. Please try again." });
        incrementAttempt();
        // Put user back in asking so they can hear question again
        setState("asking");
        setTimeout(() => setState("listening"), 2200);
        return;
      }

      // Normal flow: got a good transcript
      const event = { question: currentQuestion, transcript: transcribeResult.transcript };
      addHistoryEvent(event);
      const newHistory = [...history, event];

      // Move to next question if present
      const nextQuestion = allQuestions[newHistory.length];
      if (nextQuestion) {
        // ensure no playback is still running
        stopPlayback();
        // allow next question to play once
        setCurrentQuestion(nextQuestion);
        setState("asking");
      } else {
        // Done: generate report
        toast("Interview complete! Generating your report...");
        await api.interview.generateReport(sessionId, newHistory);
        setState("ended");
        setCurrentQuestion({
          id: "end",
          role: role,
          text: "Your interview is complete. You can now view your report.",
          question_type: "short",
        } as Question);
      }
    } catch (err: any) {
      const msg = err?.message || "An error occurred.";
      setError(msg);
      toast.error("Interview Error", { description: msg });
      setState("ended");
      setCurrentQuestion({
        id: "error",
        role: role,
        text: `An error occurred: ${msg}. Your interview has ended.`,
        question_type: "short",
      } as Question);
    }
  };

  // Timer complete -> stop recorder -> handle audio
  const handleTimerComplete = async () => {
    if (interviewState !== "listening") return;
    try {
      const file = await recorderRef.current?.stop();
      try { (window as any).__lastRecording = file; } catch {}
      setLastRecordedFile(file ?? null);
      console.debug("[session] recorded file size:", file?.size ?? null);
      await handleAudioComplete(file ?? null);
    } catch (e) {
      console.error("[session] recorder stop/handle failed", e);
      setError("Recording failed. Please try again.");
      setState("asking");
    }
  };

  // When Typewriter completes, we wait for playback to finish then go to listening
  const handleTypewriterComplete = async () => {
    if (interviewState !== "asking") return;
    try {
      if (__currentAudioPromise) {
        await Promise.race([__currentAudioPromise, new Promise((res) => setTimeout(res, 12000))]);
      } else {
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (e) {
      console.warn("[Typewriter] waiting for playback failed", e);
    }
    // start listening after a tiny gap
    setTimeout(() => setState("listening"), 500);
  };

  // Debug: play last recording
  const playLastRecording = async () => {
    const f = lastRecordedFile ?? (window as any).__lastRecording;
    if (!f) {
      toast.error("No recording available.");
      return;
    }
    try {
      const url = URL.createObjectURL(f);
      const a = new Audio(url);
      a.onended = () => { try { URL.revokeObjectURL(url); } catch {} };
      await a.play();
    } catch (e) {
      console.error("[debug] playLastRecording failed", e);
      toast.error("Could not play recording. See console.");
    }
  };

  return (
    <div className="mx-auto max-w-3xl w-full flex flex-col items-center">
      {/* Question */}
      <div className="w-full min-h-[120px] flex items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${currentQuestion?.id}-${history.length}-${attempt}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5 }}
            className="w-full"
          >
            {interviewState === "asking" && currentQuestion ? (
              <Typewriter text={currentQuestion.text} onComplete={handleTypewriterComplete} />
            ) : (
              <p className="text-3xl md:text-4xl font-semibold leading-snug">{currentQuestion?.text}</p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Visualizer */}
      <AudioWave isListening={interviewState === "listening"} />

      {/* Play last recording button for debugging */}
      <div className="mt-4">
        <Button variant="ghost" size="sm" onClick={playLastRecording} className="gap-2">Play Last Recording</Button>
      </div>

      {/* Controls / Status */}
      <div className="mt-8 min-h-[52px] flex items-center justify-center">
        {interviewState === "listening" && (
          <CountdownTimer key={`${currentQuestion?.id}-${history.length}-${attempt}`} duration={listenDuration} onComplete={handleTimerComplete} />
        )}

        {interviewState === "processing" && (
          <Button size="lg" variant="secondary" disabled className="gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            {allQuestions.length > history.length ? "Processing..." : "Finalizing report..."}
          </Button>
        )}

        {interviewState === "ended" && (
          <Button size="lg" variant="primary" onClick={() => router.push(`/report/${sessionId}`)} className="gap-2">View Full Report</Button>
        )}
      </div>

      <MinimalAudioRecorder ref={recorderRef} />
    </div>
  );
}

/* ------------------------------
   InterviewConfig component (pre-warm mic)
   ------------------------------ */
function InterviewConfig() {
  const {
    role, interviewType, resumeFile,
    setRole, setInterviewType, setResumeFile,
    setState, setSessionId, setCurrentQuestion, setAllQuestions, setError,
  } = useInterviewStore();

  const [roles, setRoles] = useState<string[]>([]);

  useEffect(() => {
    api.roles().then(setRoles).catch(() => { setError("Could not load roles from server."); });
  }, [setError]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) { toast.error("File is too large", { description: "Please upload a resume under 5MB." }); return; }
      if (!["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"].includes(file.type)) {
        toast.error("Invalid file type", { description: "Please upload a PDF, DOCX, or TXT file."}); return;
      }
      setResumeFile(file);
    }
  };

  const handleStart = async () => {
    if (!role || !interviewType || !resumeFile) { toast.error("All fields are required to start."); return; }

    try {
      // Pre-warm mic permission: do it here so permission prompt doesn't race with recording later
      if (navigator.mediaDevices?.getUserMedia) {
        try {
          const s = await navigator.mediaDevices.getUserMedia({ audio: true });
          try { s.getTracks().forEach((t) => t.stop()); } catch {}
          console.debug("[start] microphone permission pre-granted / warmed");
        } catch (perr) {
          console.warn("[start] microphone prewarm failed", perr);
        }
      }

      setState("starting");
      const response = await api.interview.start(role, interviewType, resumeFile);
      if (!response.questions || response.questions.length === 0) throw new Error("The AI did not return any questions.");

      setSessionId(response.session_id);
      setAllQuestions(response.questions);
      setCurrentQuestion(response.questions[0]);
      // Clear played-question registry when starting new session
      __playedQuestionIds.clear();
      setState("asking");
    } catch (err: any) {
      const msg = err.message || "Failed to start interview.";
      setError(msg);
      toast.error("Error", { description: msg });
      setState("configuring");
    }
  };

  const canStart = role && interviewType && resumeFile;

  return (
    <Card className="mx-auto max-w-2xl w-full p-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold">Setup your Interview</h2>
        <p className="text-muted-foreground">The AI will use your resume to ask relevant questions.</p>
      </div>

      <RoleSelect roles={roles} value={role} onChange={setRole} label="Select your target role" />

      <div>
        <label className="mb-1 block text-sm text-muted-foreground">Select interview type</label>
        <div className="grid grid-cols-2 gap-2">
          <Button variant={interviewType === "technical" ? "primary" : "outline"} onClick={() => setInterviewType("technical")}>Technical</Button>
          <Button variant={interviewType === "hr" ? "primary" : "outline"} onClick={() => setInterviewType("hr")}>HR / Behavioral</Button>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm text-muted-foreground">Upload your resume</label>
        <label htmlFor="resume-upload" className={`relative flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-6 transition hover:bg-muted/50 ${resumeFile ? "border-brand-500" : ""}`}>
          <input id="resume-upload" type="file" className="sr-only" accept=".pdf,.docx,.txt" onChange={handleFileChange} />
          {resumeFile ? (
            <div className="flex items-center gap-2 text-brand-500"><FileText className="h-5 w-5" /><span className="font-medium">{resumeFile.name}</span></div>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground"><Upload className="h-5 w-5" /><span>Click to upload (PDF, DOCX, TXT)</span></div>
          )}
        </label>
      </div>

      <Button size="lg" className="w-full gap-2" disabled={!canStart || roles.length === 0} onClick={handleStart}>
        <Sparkles className="h-5 w-5" /> Start AI Interview
      </Button>
    </Card>
  );
}

/* ------------------------------
   Main page component
   ------------------------------ */
export default function InterviewPage() {
  const { loading: authLoading } = useAuth();
  const { interviewState, error, reset } = useInterviewStore();

  useEffect(() => {
    reset();
    stopPlayback();
    __playedQuestionIds.clear();
  }, [reset]);

  const renderState = () => {
    if (authLoading) return <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />;

    if (error) {
      return (
        <Card className="mx-auto max-w-2xl w-full p-6 text-center">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
          <h2 className="mt-4 text-xl font-semibold">An Error Occurred</h2>
          <p className="mt-2 text-muted-foreground">{error}</p>
          <Button onClick={reset} variant="secondary" className="mt-6">Start Over</Button>
        </Card>
      );
    }

    switch (interviewState) {
      case "configuring": return <InterviewConfig />;
      case "starting": return <div className="flex flex-col items-center gap-4"><Loader2 className="h-12 w-12 animate-spin text-brand-500" /><p className="text-xl text-muted-foreground">Starting your session...</p></div>;
      case "asking":
      case "listening":
      case "processing":
      case "ended": return <InterviewSession />;
      default: return null;
    }
  };

  return (
    <RequireRole roles={["Student"]} mode="redirect">
      <main className="min-h-[calc(100vh-200px)] w-full flex items-center justify-center">{renderState()}</main>
    </RequireRole>
  );
}
