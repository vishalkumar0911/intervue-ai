// frontend/src/store/interview.ts
"use client";

import { create } from "zustand";
// We'll define these types in api.ts later
import type { Question, AnalysisResult } from "@/lib/api";

// The states the interview can be in
export type InterviewState =
  | "configuring" // User is setting up (role, type, resume)
  | "starting"    // We are calling the backend to get the first question
  | "asking"      // AI is "speaking" (typewriter effect)
  | "listening"   // AI is "listening" (audio recorder is on)
  | "processing"  // User finished, we are transcribing, analyzing, and getting next question
  | "ended";      // AI has ended the interview

// Each "turn" in the conversation
export type InterviewEvent = {
  question: Question;
  transcript: string;
  analysis: AnalysisResult;
};

type InterviewStore = {
  // --- Configuration ---
  role: string;
  interviewType: "technical" | "hr";
  resumeFile: File | null;
  sessionId: string | null;

  // --- State Machine ---
  interviewState: InterviewState;
  currentQuestion: Question | null;
  history: InterviewEvent[];
  error: string | null;
  attempt: number; // NEW: A counter to force re-renders

  // --- Actions ---
  // Setup
  setRole: (role: string) => void;
  setInterviewType: (type: "technical" | "hr") => void;
  setResumeFile: (file: File | null) => void;

  // State setters (used by the page logic)
  setSessionId: (id: string) => void;
  setState: (state: InterviewState) => void;
  setCurrentQuestion: (question: Question | null) => void;
  addHistoryEvent: (event: InterviewEvent) => void;
  setError: (error: string | null) => void;
  incrementAttempt: () => void; // NEW: Action to increment the counter

  // Reset
  reset: () => void;
};

const initialState = {
  role: "",
  interviewType: "technical" as "technical" | "hr",
  resumeFile: null,
  sessionId: null,
  interviewState: "configuring" as InterviewState,
  currentQuestion: null,
  history: [],
  error: null,
  attempt: 0, // NEW: Initialize counter
};

export const useInterviewStore = create<InterviewStore>((set) => ({
  ...initialState,

  // --- Actions ---
  setRole: (role) => set({ role }),
  setInterviewType: (type) => set({ interviewType: type }),
  setResumeFile: (file) => set({ resumeFile: file }),

  setSessionId: (id) => set({ sessionId: id }),
  setState: (state) => set({ interviewState: state }),
  setCurrentQuestion: (question) => set({ currentQuestion: question }),
  addHistoryEvent: (event) =>
    set((state) => ({ history: [...state.history, event] })),
  setError: (error) => set({ error }),
  incrementAttempt: () => set((state) => ({ attempt: state.attempt + 1 })), // NEW

  reset: () => set(initialState),
}));