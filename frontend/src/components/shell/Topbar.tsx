"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Topbar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  return (
    <header className="sticky top-0 z-40 bg-black/20 backdrop-blur supports-[backdrop-filter]:bg-black/30 border-b border-white/10">
      <div className="h-14 flex items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleSidebar}
            className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 hover:bg-white/10"
            aria-label="Toggle sidebar"
          >
            <Menu size={18} />
          </button>
          <Link href="/" className="md:hidden">
            <span className="bg-gradient-to-r from-brand-400 to-accent-400 bg-clip-text text-transparent font-bold">
              Intervue.AI
            </span>
          </Link>
        </div>

        <nav className="flex items-center gap-3 text-sm">
          <Link href="/interview" className="hidden sm:inline text-white/80 hover:text-white">
            Interview
          </Link>
          <Link href="/dashboard" className="hidden sm:inline text-white/80 hover:text-white">
            Dashboard
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
