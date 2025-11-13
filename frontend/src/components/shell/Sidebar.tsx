"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
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
  X,
  Users,
  Shield,
  HeartPulse,
} from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import { hasAnyRole, type Role } from "@/lib/rbac";

/* ----------------------------- Context ----------------------------- */

type SidebarContextType = {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle(): void;
  collapse(): void;
  expand(): void;
};

const SidebarContext = createContext<SidebarContextType | null>(null);

export function useSidebar(): SidebarContextType {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within <SidebarProvider>");
  return ctx;
}

/* ------------------------------- Provider -------------------------------- */

const COLLAPSE_KEY = "ui:sidebar:collapsed";

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [open, setOpen] = useState(false);

  // persist collapsed state
  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {}
  }, [collapsed]);

    // Only set data-sidebar when the desktop sidebar element is actually mounted.
  // This prevents pages which don't render the sidebar from still having the
  // data attribute (and therefore the left gutter).
  useEffect(() => {
    try {
      const el = typeof document !== "undefined" ? document.getElementById("desktop-sidebar") : null;
      if (el) {
        // sidebar exists in DOM; update attribute to reflect collapsed/expanded
        document.documentElement.setAttribute("data-sidebar", collapsed ? "collapsed" : "expanded");
      } else {
        // sidebar not present — ensure attribute is removed to avoid reserved gutter
        document.documentElement.removeAttribute("data-sidebar");
      }
    } catch {}
  }, [collapsed]);


  const value: SidebarContextType = {
    collapsed,
    setCollapsed,
    open,
    setOpen,
    toggle: () => setOpen((v) => !v),
    collapse: () => setCollapsed(true),
    expand: () => setCollapsed(false),
  };

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

/* ------------------------------ Mobile trigger ---------------------------- */

export function SidebarTrigger() {
  const { toggle } = useSidebar();
  return (
    <button
      onClick={toggle}
      className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-secondary/60 px-3 text-sm text-foreground hover:bg-secondary focus-ring"
      aria-label="Open navigation"
    >
      <Menu className="h-4 w-4" />
      Menu
    </button>
  );
}

/* --------------------------------- content -------------------------------- */

type IconType = React.ComponentType<{ className?: string; size?: number | string }>;
type Item = {
  href: string;
  label: string;
  icon: IconType;
  roles?: Role[];
};

// Nav config (roles omitted => visible to all)
const NAV: Item[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/interview", label: "Interview", icon: Mic, roles: ["Student"] },
  { href: "/analytics", label: "Analytics", icon: BarChart2, roles: ["Student", "Trainer", "Admin"] },
  { href: "/bookmarks", label: "Bookmarks", icon: Bookmark, roles: ["Student"] },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
  { href: "/trainer/questions", label: "Trainer", icon: Users, roles: ["Trainer", "Admin"] },
  { href: "/admin/users", label: "Admin", icon: Shield, roles: ["Admin"] },
  { href: "/admin/health", label: "Health", icon: HeartPulse, roles: ["Admin"] },
];

function NavList({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  const { user } = useAuth();

  const visible = NAV.filter((item) => !item.roles || hasAnyRole(user, item.roles));

  return (
    <ul className="mt-1 space-y-1" role="list">
      {visible.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
        return (
          <li key={href}>
            <Link
              href={href}
              title={collapsed ? label : undefined}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors focus-ring",
                active
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              )}
            >
              <span className="flex items-center justify-center">
                <Icon size={18} className={active ? "opacity-100" : "opacity-80"} />
              </span>

              <span
                className={clsx(
                  "truncate transition-all duration-200",
                  collapsed ? "w-0 opacity-0 overflow-hidden" : "w-full opacity-100"
                )}
                aria-hidden={collapsed}
              >
                {label}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/* ----------------------- Desktop sidebar (fixed) ------------------------ */

function DesktopSidebar() {
  const { collapsed, collapse, expand } = useSidebar();

  return (
    <>
      <aside
        id="desktop-sidebar"
        className={clsx("hidden md:block z-40")}
        style={{
          width: "var(--sidebar-width)", // unified variable
          position: "fixed",
          left: 0,
          top: "3.5rem", // same top as your navbar
          height: "calc(100vh - 3.5rem)",
          transition: "width 200ms ease-in-out",
        }}
        aria-label="Primary navigation"
      >
        <div className="surface h-full p-3 flex flex-col">
          {/* Brand / header */}
          <div className="flex items-center gap-3 px-2 pb-3">
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 text-primary-foreground">
              <span className="font-semibold">I</span>
            </div>
            {!collapsed && <div className="font-semibold text-foreground">Intervue.AI</div>}
          </div>

          {/* Nav list - scrollable */}
          <nav className="flex-1 overflow-y-auto px-2 pb-3 pt-1 nice-scrollbar" aria-label="Primary">
            <NavList collapsed={collapsed} />
          </nav>

          {/* Tip / footer */}
          <div className="mt-3 rounded-xl border border-border bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
            Tip: Press <kbd className="rounded bg-muted px-1">N</kbd> for next question
          </div>
        </div>
      </aside>

      <SidebarCollapseButton collapsed={collapsed} onToggle={() => (collapsed ? expand() : collapse())} />
    </>
  );
}

/* ----------------------- collapse button (fixed) ----------------------- */

function SidebarCollapseButton({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-label={collapsed ? "Open sidebar" : "Collapse sidebar"}
      aria-expanded={!collapsed}
      style={{
        position: "fixed",
        left: "calc(var(--sidebar-width) - 18px)",
        top: "calc(3.5rem + 12px)",
        zIndex: 60,
      }}
      className={clsx(
        "inline-flex items-center justify-center h-8 w-8 rounded-full shadow-elevated",
        "focus-ring transition-transform transform hover:scale-105",
        collapsed
          ? "bg-gradient-to-r from-purple-500 to-indigo-500 text-white ring-2 ring-offset-2 ring-offset-background"
          : "bg-secondary/60 text-foreground border border-border"
      )}
    >
      {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
    </button>
  );
}

/* ------------------------------ Mobile drawer ---------------------------- */

function MobileDrawer() {
  const { open, toggle } = useSidebar();
  const pathname = usePathname();

  // close on escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, toggle]);

  // close on route change
  useEffect(() => {
    if (!open) return;
    toggle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[95] bg-black/40 backdrop-blur-sm" onClick={toggle} aria-hidden />
      <aside className="fixed left-0 top-0 z-[100] h-svh w-[280px] p-3 md:hidden" aria-label="Mobile navigation">
        <div className="surface h-full">
          <div className="flex items-center justify-between px-2 pb-3 pt-2">
            <div className="flex items-center gap-2">
              <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-accent-500 text-primary-foreground">
                <span className="font-semibold">I</span>
              </div>
              <span className="font-semibold">Intervue.AI</span>
            </div>
            <button
              onClick={toggle}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-secondary/60 hover:bg-secondary focus-ring"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <nav aria-label="Primary">
            <NavList collapsed={false} />
          </nav>
        </div>
      </aside>
    </>
  );
}

/* ------------------------------ export default --------------------------- */

export default function Sidebar() {
  return (
    <>
      <DesktopSidebar />
      <MobileDrawer />
    </>
  );
}
