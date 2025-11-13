"use client";

import React from "react";
import { Badge } from "@/components/ui/Badge";

/**
 * FeatureTiles - 3 compact tiles describing core product features
 */

export default function FeatureTiles() {
  const features = [
    {
      title: "AI feedback",
      desc: "Automated content & delivery suggestions with example rewrites.",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
          <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      title: "Real interview mode",
      desc: "Timed sessions with live scoring, transcripts and analytics.",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
          <path d="M12 2v10l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      ),
    },
    {
      title: "Progress tracking",
      desc: "Track strengths and weakness across attempts with actionable goals.",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
          <path d="M3 12h3l2 8 4-16 2 8h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
      {features.map((f) => (
        <div key={f.title} className="p-4 rounded-xl border border-border bg-card/30 hover:shadow-lg transition-shadow">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-md bg-primary/10 text-primary inline-flex items-center justify-center">{f.icon}</div>
            <div>
              <div className="font-medium">{f.title}</div>
              <div className="mt-1 text-sm text-muted-foreground">{f.desc}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
