"use client";

import { create } from "zustand";
import type { Question } from "@/lib/api";

export type Difficulty = "" | "easy" | "medium" | "hard";

type InterviewState = {
  role: string;
  difficulty: Difficulty;
  shuffle: boolean;

  bank: Question[];
  index: number;

  loading: boolean;
  error: string | null;

  setRole: (role: string) => void;
  setDifficulty: (d: Difficulty) => void;
  setShuffle: (s: boolean) => void;

  setBank: (q: Question[]) => void;
  setIndex: (i: number) => void;

  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;

  next: () => void;
  reset: () => void;
};

export const useInterviewStore = create<InterviewState>((set, get) => ({
  role: "",
  difficulty: "",
  shuffle: false,

  bank: [],
  index: 0,

  loading: false,
  error: null,

  setRole: (role) => set({ role }),
  setDifficulty: (difficulty) => set({ difficulty }),
  setShuffle: (shuffle) => set({ shuffle }),

  setBank: (bank) => set({ bank }),
  setIndex: (index) => set({ index }),

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  next: () => {
    const { bank, index } = get();
    if (!bank.length) return;
    set({ index: (index + 1) % bank.length });
  },

  reset: () => set({ bank: [], index: 0, error: null }),
}));
