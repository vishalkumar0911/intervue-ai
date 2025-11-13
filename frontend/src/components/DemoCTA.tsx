"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * DemoCTA
 * - "Try a 60s demo" button that opens an accessible modal
 * - Modal contains an embedded iframe (YouTube) or placeholder
 *
 * Replace the YOUTUBE_ID with your demo, or swap iframe for <video>.
 */

export default function DemoCTA() {
  const [open, setOpen] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const el = modalRef.current;
    el?.focus();
    return () => prevFocus?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className="mt-6">
        <Button variant="ghost" onClick={() => setOpen(true)}>
          ▶ Try a 60s demo — no signup
        </Button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} aria-hidden />
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            className="relative z-10 w-full max-w-3xl rounded-xl bg-card border border-border shadow-soft"
            style={{ outline: "none" }}
          >
            <div className="flex items-center justify-between p-3 border-b border-border">
              <div className="text-sm font-medium">1-minute demo</div>
              <button
                aria-label="Close demo"
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-1 text-sm hover:bg-muted/10 focus-ring"
              >
                Close
              </button>
            </div>

            <div className="p-4">
              {/* Replace VIDEO_ID with your own or swap to <video> element */}
              <div className="aspect-video w-full bg-black rounded-md overflow-hidden">
                <iframe
                  title="Intervue.AI demo"
                  className="w-full h-full"
                  src="https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                />
              </div>

              <p className="mt-3 text-sm text-muted-foreground">
                This demo shows a short mock interview and the kind of feedback Intervue.AI provides after each attempt.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
