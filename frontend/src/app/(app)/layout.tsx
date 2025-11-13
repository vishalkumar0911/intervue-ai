"use client";

import React, { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { SidebarTrigger, useSidebar, SidebarProvider } from "@/components/shell/Sidebar";
import SidebarShell from "@/components/shell/SidebarShell";

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
  const { open, setOpen } = useSidebar();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const overlayRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative w-full gap-4 px-4 py-4 md:min-h-[calc(100dvh-3.5rem)]">
      <SkipToContent />

      {/* Sidebar is conditionally rendered by SidebarShell.
          SidebarShell will return null on pages where sidebar shouldn't exist.
          Because this file wraps LayoutInner in SidebarProvider (see export below),
          SidebarShell (and the Sidebar it mounts) will operate inside the provider. */}
      <SidebarShell />

      {/* Mobile header + trigger */}
      <div className="mb-3 flex items-center justify-between md:hidden">
        <SidebarTrigger />
      </div>

      {/* Main content wrapper */}
      <div className="relative min-w-0">
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

      {/* Mobile overlay (covers main when mobile drawer open) */}
      {open && (
        <div
          ref={overlayRef}
          onClick={() => setOpen(false)}
          aria-hidden="true"
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm md:hidden"
        />
      )}
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      {/* SidebarProvider provides data-sidebar attribute and collapsed state */}
      <LayoutInner>{children}</LayoutInner>
    </SidebarProvider>
  );
}
