// vishalkumar0911/intervue-ai/intervue-ai-Vishal/frontend/src/app/(app)/interview/page.tsx
// frontend/src/app/(app)/interview/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Mic, Sparkles, Upload, FileText, Square, AlertTriangle, Timer } from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import RequireRole from "@/components/auth/RequireRole";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/Card";
import RoleSelect from "@/components/RoleSelect";
import { api, Question, TranscribeResult } from "@/lib/api";
import { useInterviewStore } from "@/store/interview";

// --- New Components ---

/**
 * A simple typewriter effect component
 */
function Typewriter({ text, onComplete }: { text: string; onComplete: () => void }) {
  const [displayText, setDisplayText] = useState("");
  const indexRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  // split into grapheme clusters -- [...text] is OK for most cases; for full correctness you can use Intl.Segmenter
  const chars = useMemo(() => {
    // If you're targeting modern browsers you can use: return [...new Intl.Segmenter().segment(text)].map(s => s.segment);
    return Array.from(text); // handles surrogate pairs better than charAt
  }, [text]);

  useEffect(() => {
    // cleanup any previous timer
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    indexRef.current = 0;
    setDisplayText("");

    if (!chars || chars.length === 0) {
      onComplete();
      return;
    }

    // show first character immediately to avoid initial-skip visual glitch
    setDisplayText(chars[0]);
    indexRef.current = 1;

    // compute per-character delay: adjust to taste
    const perCharDelay = Math.max(20, Math.min(200, Math.round(600 / Math.max(1, chars.length))));

    timerRef.current = window.setInterval(() => {
      if (indexRef.current >= chars.length) {
        if (timerRef.current) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        onComplete();
        return;
      }
      const nextChar = chars[indexRef.current];
      setDisplayText((prev) => prev + nextChar);
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



/**
 * A simple audio visualizer
 */
function AudioWave({ isListening }: { isListening: boolean }) {
  return (
    <div
      className="relative flex w-full h-24 items-center justify-center overflow-hidden"
      aria-hidden
    >
      {isListening ? (
        // Animate bars when listening
        <div className="flex items-center justify-center gap-1.5 h-full">
          {[...Array(32)].map((_, i) => (
            <motion.div
              key={i}
              className="w-1.5 bg-brand-500"
              initial={{ height: "4px" }}
              animate={{ height: ["4px", "60px", "10px", "4px"] }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: i * 0.05,
              }}
            />
          ))}
        </div>
      ) : (
        // Static line when not
        <div className="h-0.5 w-full bg-border" />
      )}
    </div>
  );
}

// A component to show a countdown timer
function CountdownTimer({ duration, onComplete }: { duration: number; onComplete: () => void }) {
  const [remaining, setRemaining] = useState(duration);
  const timerRef = useRef<NodeJS.Timeout>();
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete; // Keep ref updated

  useEffect(() => {
    setRemaining(duration); // Reset timer on duration change

    timerRef.current = setInterval(() => {
      setRemaining((prev) => {
        const next = prev - 1000;
        if (next <= 0) {
          clearInterval(timerRef.current);
          onCompleteRef.current(); // Call the latest onComplete
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [duration]);

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  return (
    <div className="flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-lg font-medium text-muted-foreground">
      <Timer className="h-5 w-5" />
      <span>
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </span>
    </div>
  );
}


/**
 * The main AI "chat" interface
 */
function InterviewSession() {
  const router = useRouter();
  const {
    interviewState,
    currentQuestion,
    sessionId,
    history,
    role,
    interviewType,
    attempt, // Get the new attempt counter
    allQuestions, // Get all questions
    setState,
    setCurrentQuestion,
    addHistoryEvent,
    setError,
    incrementAttempt, // Get the new action
  } = useInterviewStore();

  const recorderRef = useRef<{ start: () => Promise<void>; stop: () => Promise<File | null> }>(null);
  
  // Calculate duration based on the question type from the AI
  const listenDuration = useMemo(() => {
    if (currentQuestion?.question_type === "short") {
      return 30000; // 30 seconds
    }
    // Default to 60 seconds for "long" or if type is undefined
    return 60000; // 60 seconds
  }, [currentQuestion?.question_type]);

  // This is the core audio processing loop
  const handleAudioComplete = async (audioFile: File | null) => {
    
    // Debug: allow developer to play recorded file in page for diagnosis
    async function playDebug(f: File) {
      const url = URL.createObjectURL(f);
      const a = document.createElement("audio");
      a.controls = true;
      a.src = url;
      document.body.appendChild(a);
      try { await a.play(); } catch {}
    }

    if (!audioFile || audioFile.size < 1500) { // Using 1.5KB threshold
      toast.warning("Audio was inaudible", { description: "Your response was too short. Please try again." });
      incrementAttempt(); 
      setState("asking"); // Show question again
      
      // Wait for "asking" state to render, then set to "listening"
      setTimeout(() => setState("listening"), 2000); // 2-second pause
      return;
    }
    
    // playDebug(audioFile); // Uncomment for local debugging

    if (!currentQuestion || !sessionId) {
      setError("Session error. Please restart.");
      return;
    }

    try {
      // 2. Transcribe
      setState("processing");
      
      //
      // --- ⬇️ MODIFIED `api.interview.transcribe` call ⬇️ ---
      //
      const transcribeResult = await api.interview.transcribe(
        audioFile,
        currentQuestion.id,
        sessionId
      );
      //
      // --- ⬆️ END MODIFIED call ⬆️ ---
      //

      // 3. Store this "turn" locally
      const event = {
        question: currentQuestion,
        transcript: transcribeResult.transcript,
        // Analysis is no longer here
      };
      addHistoryEvent(event);
      const newHistory = [...history, event]; // Get the newly updated history

      // 4. Find the next question from our list
      const nextQuestion = allQuestions[newHistory.length]; // e.g., if history.length is 1, get allQuestions[1]

      if (nextQuestion) {
        // 5a. If there is a next question, ask it
        setCurrentQuestion(nextQuestion);
        setState("asking");
        // Flow: asking -> (typewriter) -> (pause) -> listening
      } else {
        // 5b. No more questions. End the interview and generate report.
        toast("Interview complete! Generating your report...");
        
        // This is the new batch analysis call
        // api.ts maps this to /interview/complete
        await api.interview.generateReport(sessionId, newHistory);
        
        // Set to ended state
        setState("ended");
        setCurrentQuestion({
          id: "end",
          role: role,
          text: "Your interview is complete. You can now view your report.",
          question_type: "short"
        });
      }
    } catch (err: any) {
      const msg = err.message || "An error occurred.";
      setError(msg);
      toast.error("Interview Error", { description: msg });
      
      // Set state to "ended" and show an error message
      setState("ended");
      setCurrentQuestion({
        id: "error",
        role: role,
        text: `An error occurred: ${msg}. Your interview has ended.`,
        question_type: "short"
      });
    }
  };

  // Trigger recorder when state changes to "listening"
  useEffect(() => {
    if (interviewState === "listening") {
      (async () => {
        try {
          await recorderRef.current?.start();
          console.debug("[session] recorder started for question", currentQuestion?.id);
        } catch (e) {
          console.error("[session] recorder start failed", e);
        }
      })();
    }
  }, [interviewState, currentQuestion?.id]);

  // This function is called by the CountdownTimer when it hits zero
  // Timer complete calls stop() and waits for the file
  const handleTimerComplete = async () => {
    if (interviewState === "listening") {
      try {
        const file = await recorderRef.current?.stop();
        await handleAudioComplete(file ?? null);
      } catch (e) {
        console.error("[session] recorder stop/handle failed", e);
        setError("Recording failed. Please try again.");
        setState("asking");
      }
    }
  };
  
  // Go from "asking" (typewriter) to "listening" when text is done
  const handleTypewriterComplete = () => {
    if (interviewState === "asking") {
      // Add a 2-second pause before listening
      setTimeout(() => {
        setState("listening");
      }, 2000); // 2-second pause
    }
  };
  
  return (
    <div className="mx-auto max-w-3xl w-full flex flex-col items-center">
      
      {/* --- 1. Question Text Area --- */}
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
            {/* Show Typewriter only when asking */}
            {interviewState === "asking" && currentQuestion ? (
              <Typewriter 
                text={currentQuestion.text} 
                onComplete={handleTypewriterComplete} 
              />
            ) : (
              // Show static question text for all other active states
              <p className="text-3xl md:text-4xl font-semibold leading-snug">
                {currentQuestion?.text}
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* --- 2. Visualizer Area --- */}
      <AudioWave isListening={interviewState === "listening"} />

      {/* --- 3. Controls / Status Area --- */}
      <div className="mt-8 min-h-[52px] flex items-center justify-center">
        {interviewState === "listening" && (
          <CountdownTimer 
            key={`${currentQuestion?.id}-${history.length}-${attempt}`}
            duration={listenDuration}
            onComplete={handleTimerComplete}
          />
        )}

        {interviewState === "processing" && (
          <Button size="lg" variant="secondary" disabled className="gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            {/* Show a different message on the *final* processing step */}
            {allQuestions.length > history.length ? "Processing..." : "Finalizing report..."}
          </Button>
        )}

        {interviewState === "ended" && (
          <Button
            size="lg"
            variant="primary"
            onClick={() => router.push(`/report/${sessionId}`)}
            className="gap-2"
          >
            View Full Report
          </Button>
        )}
      </div>

      {/* Hidden Audio Recorder Logic */}
      <MinimalAudioRecorder
        ref={recorderRef}
        // No onRecordingComplete prop
      />
    </div>
  );
}

/**
 * A configuration screen for the user to set up their interview
 */
function InterviewConfig() {
  const {
    role,
    interviewType,
    resumeFile,
    setRole,
    setInterviewType,
    setResumeFile,
    setState,
    setSessionId,
    setCurrentQuestion,
    setAllQuestions, // Get the action
    setError,
  } = useInterviewStore();

  const [roles, setRoles] = useState<string[]>([]);

  // Load roles from API
  useEffect(() => {
    api.roles().then(setRoles).catch(() => {
      setError("Could not load roles from server.");
    });
  }, [setError]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      // Basic validation
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        toast.error("File is too large", { description: "Please upload a resume under 5MB."});
        return;
      }
      if (!["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"].includes(file.type)) {
        toast.error("Invalid file type", { description: "Please upload a PDF, DOCX, or TXT file."});
        return;
      }
      setResumeFile(file);
    }
  };
  
  const handleStart = async () => {
    if (!role || !interviewType || !resumeFile) {
      toast.error("All fields are required to start.");
      return;
    }
    
    try {
      setState("starting");
      // This response now contains the *full list* of questions
      const response = await api.interview.start(role, interviewType, resumeFile);
      
      if (!response.questions || response.questions.length === 0) {
        throw new Error("The AI did not return any questions.");
      }

      setSessionId(response.session_id);
      setAllQuestions(response.questions); // Save all questions to the store
      setCurrentQuestion(response.questions[0]); // Set just the first question
      setState("asking"); // Move to the "asking" state
      
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
        <p className="text-muted-foreground">
          The AI will use your resume to ask relevant questions.
        </p>
      </div>

      {/* 1. Role Select */}
      <RoleSelect
        roles={roles}
        value={role}
        onChange={setRole}
        label="Select your target role"
      />

      {/* 2. Interview Type */}
      <div>
        <label className="mb-1 block text-sm text-muted-foreground">
          Select interview type
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={interviewType === "technical" ? "primary" : "outline"}
            onClick={() => setInterviewType("technical")}
          >
            Technical
          </Button>
          <Button
            variant={interviewType === "hr" ? "primary" : "outline"}
            onClick={() => setInterviewType("hr")}
          >
            HR / Behavioral
          </Button>
        </div>
      </div>

      {/* 3. Resume Upload */}
      <div>
        <label className="mb-1 block text-sm text-muted-foreground">
          Upload your resume
        </label>
        <label
          htmlFor="resume-upload"
          className={`relative flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-6 transition hover:bg-muted/50
          ${resumeFile ? "border-brand-500" : ""}`}
        >
          <input
            id="resume-upload"
            type="file"
            className="sr-only"
            accept=".pdf,.docx,.txt"
            onChange={handleFileChange}
          />
          {resumeFile ? (
            <div className="flex items-center gap-2 text-brand-500">
              <FileText className="h-5 w-5" />
              <span className="font-medium">{resumeFile.name}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Upload className="h-5 w-5" />
              <span>Click to upload (PDF, DOCX, TXT)</span>
            </div>
          )}
        </label>
      </div>
      
      <Button 
        size="lg" 
        className="w-full gap-2" 
        disabled={!canStart || roles.length === 0}
        onClick={handleStart}
      >
        <Sparkles className="h-5 w-5" />
        Start AI Interview
      </Button>
    </Card>
  );
}

/**
 * MinimalAudioRecorder (single-responsibility)
 * - start(): begins recording
 * - stop(): returns Promise<File | null> which resolves when recorder stops
 *
 * Important: It DOES NOT call a separate onRecordingComplete prop.
 * The parent must call stop().then(file => ...).
 */
const MinimalAudioRecorder = React.forwardRef<
  { start: () => Promise<void>; stop: () => Promise<File | null> },
  {}
>((_, ref) => {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeTypeRef = useRef<string>("audio/webm");

  // Start recording
  const start = async () => {
    try {
      stopStream(); // cleanup
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Media devices not supported");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const supported = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg"
      ].find((t) => MediaRecorder.isTypeSupported(t));
      mimeTypeRef.current = supported || "audio/webm";

      chunksRef.current = []; // reset chunks every start

      const rec = new MediaRecorder(stream, { mimeType: mimeTypeRef.current });
      mediaRecorderRef.current = rec;

      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      // single onstop handler (we won't call parent from here)
      rec.onstop = () => {
        // nothing here — stop() resolves the file
      };

      rec.start();
      console.debug("[recorder] started; mime:", mimeTypeRef.current);
    } catch (err) {
      console.error("[recorder] start failed", err);
      stopStream();
      // nothing else — the parent will detect no file on stop
    }
  };

  // Stop recording and return File or null
  const stop = (): Promise<File | null> =>
    new Promise((resolve) => {
      const rec = mediaRecorderRef.current;
      if (rec && rec.state === "recording") {
        // Setup resolution once, don't override other handlers
        const cleanupAndResolve = () => {
          const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
          const file = blob.size > 0 ? new File([blob], "interview-answer.webm", { type: mimeTypeRef.current }) : null;
          stopStream();
          console.debug("[recorder] stopped; blobSize=", blob.size);
          resolve(file);
        };

        // Ensure we only attach a single 'onstop' here
        rec.onstop = cleanupAndResolve;
        try {
          rec.stop();
        } catch (e) {
          console.warn("[recorder] stop() threw", e);
          cleanupAndResolve();
        }
      } else {
        // Not recording - immediately resolve null
        stopStream();
        resolve(null);
      }
    });

  const stopStream = () => {
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch (e) {
      // ignore
    }
    streamRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  };

  React.useImperativeHandle(ref, () => ({ start, stop }));

  useEffect(() => {
    return () => stopStream();
  }, []);

  return null;
});
MinimalAudioRecorder.displayName = "MinimalAudioRecorder";

/**
 * Main Page Component
 */
export default function InterviewPage() {
  const { user, loading: authLoading } = useAuth();
  const { interviewState, error, reset } = useInterviewStore();
  
  useEffect(() => {
    // Reset the store on mount, in case a session was left hanging
    reset();
  }, [reset]);

  const renderState = () => {
    if (authLoading) {
      return <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />;
    }
    
    if (error) {
      return (
        <Card className="mx-auto max-w-2xl w-full p-6 text-center">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
          <h2 className="mt-4 text-xl font-semibold">An Error Occurred</h2>
          <p className="mt-2 text-muted-foreground">{error}</p>
          <Button onClick={reset} variant="secondary" className="mt-6">
            Start Over
          </Button>
        </Card>
      );
    }
    
    switch (interviewState) {
      case "configuring":
        return <InterviewConfig />;
      case "starting":
        return (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-brand-500" />
            <p className="text-xl text-muted-foreground">Starting your session...</p>
          </div>
        );
      case "asking":
      case "listening":
      case "processing":
      case "ended":
        return <InterviewSession />;
      default:
        return null;
    }
  };

  return (
    <RequireRole roles={["Student"]} mode="redirect">
      <main className="min-h-[calc(100vh-200px)] w-full flex items-center justify-center">
        {renderState()}
      </main>
    </RequireRole>
  );
}