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
import { hasAnyRole, type Role } from "@/lib/rbac"; // ✅ Role union type ("Student"|"Trainer"|"Admin")

/* ----------------------------- context ----------------------------- */

type SidebarContextType = {
  collapsed: boolean;      // desktop collapsed
  setCollapsed: (v: boolean) => void; // ✅ expose setter
  open: boolean;           // mobile drawer open
  setOpen: (v: boolean) => void;      // ✅ expose setter
  toggle(): void;          // mobile: open/close
  collapse(): void;        // desktop: collapse
  expand(): void;          // desktop: expand
};

const SidebarContext = createContext<SidebarContextType | null>(null);

export function useSidebar(): SidebarContextType {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within <SidebarProvider>");
  return ctx;
}

/* ------------------------------- provider -------------------------------- */

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

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {}
  }, [collapsed]);

  const value: SidebarContextType = {
    collapsed,
    setCollapsed,          // ✅
    open,
    setOpen,               // ✅
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
  roles?: Role[]; // ✅ exact type
};

// roles: omit/empty => visible to all
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
              <Icon size={16} className={active ? "opacity-100" : "opacity-80"} />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function DesktopSidebar() {
  const { collapsed, collapse, expand } = useSidebar();

  return (
    <aside
      className={clsx(
        "relative hidden md:block",
        "sticky top-20 h-[calc(100vh-5rem)] overflow-y-auto nice-scrollbar", // 🔼 slightly higher
        "transition-[width] duration-300 ease-in-out",
        collapsed ? "w-[72px]" : "w-[264px]"
      )}
      aria-label="Primary"
    >
      <div className="surface h-full p-3">
        {/* collapse / expand button */}
        <button
          onClick={collapsed ? expand : collapse}
          className="absolute -right-3 top-4 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-secondary/60 hover:bg-secondary focus-ring"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 px-2 pb-3">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 text-primary-foreground">
            <span className="font-semibold">I</span>
          </div>
          {!collapsed && <div className="font-semibold text-foreground">Intervue.AI</div>}
        </div>

        <NavList collapsed={collapsed} />

        {/* Tip */}
        <div className="mt-3 rounded-xl border border-border bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
          Tip: Press <kbd className="rounded bg-muted px-1">N</kbd> for next question
        </div>
      </div>
    </aside>
  );
}

function MobileDrawer() {
  const { open, toggle } = useSidebar();
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && toggle();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, toggle]);

  useEffect(() => {
    if (open) toggle();
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

export default function Sidebar() {
  return (
    <>
      <DesktopSidebar />
      <MobileDrawer />
    </>
  );
}
