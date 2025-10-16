"use client";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();

  // Avoid SSR/CSR label/icon mismatches
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && theme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle theme"      // stays static on SSR
      title={label}                  // tooltip can change after mount
      aria-pressed={isDark}
      className={[
        "group relative inline-flex h-10 w-10 items-center justify-center rounded-xl transition-colors focus-ring",
        // light
        "border border-black/10 bg-black/[0.04] text-slate-900 hover:bg-black/[0.06]",
        // dark
        "dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10",
      ].join(" ")}
    >
      {/* Crossfading icons */}
      <Sun
        aria-hidden="true"
        size={18}
        className={`absolute transition-all duration-200 ${
          isDark
            ? "rotate-90 scale-90 opacity-0"
            : "rotate-0 scale-100 opacity-100 group-hover:scale-100"
        }`}
      />
      <Moon
        aria-hidden="true"
        size={18}
        className={`absolute transition-all duration-200 ${
          isDark
            ? "rotate-0 scale-100 opacity-100 group-hover:scale-100"
            : "rotate-90 scale-90 opacity-0"
        }`}
      />
    </button>
  );
}
