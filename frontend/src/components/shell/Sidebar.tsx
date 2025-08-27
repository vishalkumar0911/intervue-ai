"use client";

import React, { createContext, useContext, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  LayoutDashboard,
  Mic,
  Bookmark,
  BarChart2,
  Settings as SettingsIcon,
  Menu,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

/* ----------------------------- context & hook ----------------------------- */

type SidebarContextType = {
  collapsed: boolean;  // desktop collapsed
  open: boolean;       // mobile drawer
  toggle(): void;      // mobile: open/close
  collapse(): void;    // desktop: collapse
  expand(): void;      // desktop: expand
};

const SidebarContext = createContext<SidebarContextType | null>(null);

export function useSidebar(): SidebarContextType {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within <SidebarProvider>");
  return ctx;
}

/* ------------------------------- provider -------------------------------- */

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);

  const value: SidebarContextType = {
    collapsed,
    open,
    toggle: () => setOpen((v) => !v),
    collapse: () => setCollapsed(true),
    expand: () => setCollapsed(false),
  };

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

/* ------------------------------ mobile trigger ---------------------------- */

export function SidebarTrigger() {
  const { toggle } = useSidebar();
  return (
    <button
      onClick={toggle}
      className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white/80 hover:bg-white/10 dark:text-white/80"
      aria-label="Open navigation"
    >
      <Menu className="h-4 w-4" />
      Menu
    </button>
  );
}

/* --------------------------------- content -------------------------------- */

type IconType = React.ComponentType<{ className?: string; size?: number | string }>;
type Item = { href: string; label: string; icon: IconType };

const NAV: Item[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/interview", label: "Interview", icon: Mic },
  { href: "/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/bookmarks", label: "Bookmarks", icon: Bookmark },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

function SidebarInner() {
  const { collapsed, collapse, expand } = useSidebar();
  const pathname = usePathname();

  return (
    <aside
      className={clsx(
        "relative rounded-2xl p-3",
        "border border-black/10 bg-white text-slate-900 shadow-sm",
        "dark:border-white/10 dark:bg-white/5 dark:text-white",
        "transition-[width] duration-300 ease-in-out",
        collapsed ? "w-[72px]" : "w-[260px]",
        "hidden md:block"
      )}
    >
      {/* collapse / expand button */}
      <button
        onClick={collapsed ? expand : collapse}
        className="absolute -right-3 top-4 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>

      {/* Header (no ThemeToggle) */}
      <div className="flex items-center gap-3 px-2 pb-3">
        <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 text-white">
          <span className="font-semibold">I</span>
        </div>
        {!collapsed && <div className="font-semibold">Intervue.AI</div>}
      </div>

      {/* Links */}
      <ul className="mt-1 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-black/5 text-slate-900 dark:bg-white/10 dark:text-white"
                    : "text-slate-700 hover:bg-black/5 hover:text-slate-900 dark:text-white/80 dark:hover:bg-white/10 dark:hover:text-white"
                )}
              >
                <Icon size={16} className={active ? "opacity-100" : "opacity-80"} />
                {!collapsed && <span className="truncate">{label}</span>}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Small tip at the bottom */}
      <div className="mt-3 rounded-xl border border-black/10 bg-black/[0.03] px-3 py-2 text-xs text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/70">
        Tip: Press <kbd className="rounded bg-black/10 px-1 dark:bg-white/10">N</kbd> for next question
      </div>
    </aside>
  );
}

/** Default export */
export default function Sidebar() {
  return <SidebarInner />;
}
