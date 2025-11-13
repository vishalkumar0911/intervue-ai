"use client";

import React from "react";
import useApi from "@/lib/useApi";
import { api } from "@/lib/api";

/**
 * HeroMetrics
 * - Shows Questions / Attempts / Users pulled from backend api.stats()
 * - Graceful fallback to static numbers if backend unreachable.
 */

export default function HeroMetrics() {
  const { data, error, loading } = useApi(
    ["stats"],
    async () => {
      try {
        return await api.stats();
      } catch (e) {
        throw e;
      }
    },
    { initialData: undefined }
  );

  // Fallback display if backend unavailable
  const fallback = {
    questions_per_role: {},
    attempts_total: 15000,
    attempts_by_role: {},
    attempts_by_difficulty: {},
  };

  const stats = data ?? fallback;

  // Derive numbers (simple examples)
  const questionsCount =
    typeof stats.questions_size === "number"
      ? `${stats.questions_size.toLocaleString()}+`
      : Object.values(stats.questions_per_role).reduce((a: number, b: any) => a + (b || 0), 0) || "20k+";

  const attemptsCount = typeof stats.attempts_size === "number" ? `${stats.attempts_size.toLocaleString()}+` : `${stats.attempts_total || "15k+"}`;

  // active users — backend may not provide; use heuristic
  const usersCount = (stats.counts && stats.counts["users"]) ? `${stats.counts["users"]}+` : "12k+";

  const items = [
    { key: "Questions", value: questionsCount, hint: "Curated + contributed questions" },
    { key: "Interviews", value: attemptsCount, hint: "Mock interviews completed" },
    { key: "Active users", value: usersCount, hint: "Learners using the app" },
  ];

  return (
    <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
      {items.map((it) => (
        <div key={it.key} className="flex items-center gap-4 bg-card/30 border border-border rounded-xl px-4 py-3">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-md bg-primary/10 text-primary text-lg font-semibold">
            {it.value}
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{it.key}</div>
            <div className="text-sm font-semibold">{it.hint}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
