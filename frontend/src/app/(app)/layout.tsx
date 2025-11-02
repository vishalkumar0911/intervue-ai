// frontend/src/app/(app)/layout.tsx
"use client";

import React, { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import Sidebar, { SidebarTrigger, useSidebar, SidebarProvider } from "@/components/shell/Sidebar";

/** Keyboard skip link */
function SkipToContent() {
  return (
    <a
      href="#app-main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-black/80 focus:px-3 focus:py-2 focus:text-white"
    >
      Skip to content
    </a>
  );
}

function LayoutInner({ children }: { children: React.ReactNode }) {
  const { collapsed, open, setOpen } = useSidebar();
  const style = { ["--sb" as any]: collapsed ? "72px" : "264px" } as React.CSSProperties;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const overlayRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className="relative w-full gap-4 px-4 py-4 md:grid md:min-h-[calc(100dvh-3.5rem)] md:grid-cols-[var(--sb)_1fr]"
      style={style}
    >
      <SkipToContent />

      {/* Sidebar column */}
      <aside role="complementary" aria-label="Primary navigation" className="relative">
        <Sidebar />
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div
          ref={overlayRef}
          onClick={() => setOpen(false)}
          aria-hidden="true"
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm md:hidden"
        />
      )}

      {/* Main column */}
      <div className="relative min-w-0">
        {/* mobile header row */}
        <div className="mb-3 flex items-center justify-between md:hidden">
          <SidebarTrigger />
        </div>

        {/* Only the content is width-constrained */}
        <main
          id="app-main"
          role="main"
          tabIndex={-1}
          aria-live="polite"
          className="focus:outline-none mx-auto max-w-7xl"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
      <SidebarProvider>
        <LayoutInner>{children}</LayoutInner>
      </SidebarProvider>
  );
}
