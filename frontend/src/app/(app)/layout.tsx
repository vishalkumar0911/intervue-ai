"use client";

import React, { useEffect, useRef } from "react";
import Sidebar, { SidebarTrigger, useSidebar } from "@/components/shell/Sidebar";
import { SidebarProvider } from "@/components/shell/Sidebar";

/**
 * A small skip link for keyboard users.
 * It appears when focused and jumps to the main content.
 */
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

  // keep CSS variable in sync with collapsed state
  const style = { ["--sb" as any]: collapsed ? "72px" : "260px" };

  // Close drawer on Escape key when in mobile open state
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const overlayRef = useRef<HTMLDivElement>(null);

  return (
    <SidebarProvider>
    <div
      className="relative mx-auto max-w-7xl gap-4 px-4 py-4 md:grid md:min-h-[calc(100dvh-3.5rem)] md:grid-cols-[var(--sb)_1fr]"
      style={style}
    >
      {/* Skip link for accessibility */}
      <SkipToContent />

      {/* Sidebar region */}
      <aside
        role="complementary"
        aria-label="Primary navigation"
        className="relative"
      >
        <Sidebar />
      </aside>

      {/* Mobile overlay for drawer (click to close) */}
      {open && (
        <div
          ref={overlayRef}
          onClick={() => setOpen(false)}
          aria-hidden="true"
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm md:hidden"
        />
      )}

      {/* Main region */}
      <div className="relative min-w-0">
        {/* mobile toggle row */}
        <div className="mb-3 flex items-center justify-between md:hidden">
          <SidebarTrigger />
        </div>

        <main
          id="app-main"
          role="main"
          tabIndex={-1}
          className="focus:outline-none"
          aria-live="polite"
        >
          {children}
        </main>
      </div>
    </div>
    </SidebarProvider>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // Provider sits at RootLayout; simply render the inner layout
  return <LayoutInner>{children}</LayoutInner>;
}
