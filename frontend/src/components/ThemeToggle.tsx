"use client";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      aria-pressed={isDark}
      className={[
        "group relative inline-flex h-10 w-10 items-center justify-center rounded-xl transition-colors focus-ring",
        // light
        "border border-black/10 bg-black/[0.04] text-slate-900 hover:bg-black/[0.06]",
        // dark
        "dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10",
      ].join(" ")}
    >
      {/* Icons overlap and crossfade */}
      <Sun
        aria-hidden="true"
        size={18}
        className="absolute rotate-90 scale-90 opacity-0 transition-all duration-200 group-hover:scale-100 dark:rotate-0 dark:scale-100 dark:opacity-100"
      />
      <Moon
        aria-hidden="true"
        size={18}
        className="absolute rotate-0 scale-100 opacity-100 transition-all duration-200 group-hover:scale-100 dark:rotate-90 dark:scale-90 dark:opacity-0"
      />
    </button>
  );
}
