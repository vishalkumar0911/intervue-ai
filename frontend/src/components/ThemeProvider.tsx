"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

type Theme = "light" | "dark";
type Ctx = {
  theme: Theme;
  /** Force a theme; marks preference as manual (persisted). */
  setTheme: (t: Theme) => void;
  /** Toggle between light/dark; marks preference as manual (persisted). */
  toggle: () => void;
  /** Clear manual preference and follow the OS setting. */
  system: () => void;
  /** Convenience flag */
  isDark: boolean;
};

const ThemeCtx = createContext<Ctx | null>(null);

const STORAGE_KEY = "theme";

/** Read initial theme synchronously to reduce “flash” on first client render */
function getInitialTheme(): { theme: Theme; manual: boolean } {
  if (typeof window === "undefined") return { theme: "dark", manual: false };
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") {
      return { theme: saved, manual: true };
    }
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return { theme: prefersDark ? "dark" : "light", manual: false };
  } catch {
    return { theme: "dark", manual: false };
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const initial = useRef(getInitialTheme());
  const [theme, _setTheme] = useState<Theme>(initial.current.theme);
  const [manual, setManual] = useState<boolean>(initial.current.manual);

  // Apply/remove the .dark class and set color-scheme for native controls
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
  }, [theme]);

  // Persist only if the user explicitly chose a theme
  useEffect(() => {
    try {
      if (manual) window.localStorage.setItem(STORAGE_KEY, theme);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, [theme, manual]);

  // Follow system changes when not in manual mode
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");

    const handle = (e: MediaQueryListEvent | MediaQueryList) => {
      // Only auto-switch if user hasn’t chosen manually
      if (!manual) _setTheme(e.matches ? "dark" : "light");
    };

    // Initial sync in case state drifted
    handle(mql);

    if ("addEventListener" in mql) {
      mql.addEventListener("change", handle as (e: Event) => void);
      return () => mql.removeEventListener("change", handle as (e: Event) => void);
    } else {
      // Safari <14 fallback
      // @ts-ignore
      mql.addListener(handle);
      // @ts-ignore
      return () => mql.removeListener(handle);
    }
  }, [manual]);

  // Public API
  const setTheme = (t: Theme) => {
    setManual(true);
    _setTheme(t);
  };
  const toggle = () => setTheme(theme === "dark" ? "light" : "dark");
  const system = () => {
    setManual(false);
    // Snap to current system immediately
    if (typeof window !== "undefined") {
      const mql = window.matchMedia("(prefers-color-scheme: dark)");
      _setTheme(mql.matches ? "dark" : "light");
    }
  };

  const value = useMemo<Ctx>(
    () => ({ theme, setTheme, toggle, system, isDark: theme === "dark" }),
    [theme]
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
