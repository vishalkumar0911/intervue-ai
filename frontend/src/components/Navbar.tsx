// frontend/src/components/Navbar.tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState, useRef } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Menu, X, ChevronDown, LogOut } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { hasAnyRole, type Role } from "@/lib/rbac";

// Update Item type to include optional role restrictions
type Item = {
  href: string;
  label: string;
  roles?: Role[];
};

// ---- NavLink ----
type NavLinkProps = Item & { active?: boolean; onClick?: () => void };

function NavLink({ href, label, active = false, onClick }: NavLinkProps) {
  const base =
    "relative rounded-lg px-3 py-2 text-sm transition-colors focus-ring";
  const cls = active
    ? "text-foreground bg-secondary/60"
    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60";

  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`${base} ${cls}`}
    >
      {label}
      {active && (
        <span className="pointer-events-none absolute inset-x-3 -bottom-1 h-[2px] rounded-full bg-gradient-to-r from-brand-400 to-cyan-400" />
      )}
    </Link>
  );
}

// 2. Define the comprehensive list of navigation items with role restrictions.
const ALL_NAV_ITEMS: Item[] = [
  // Roles list mirrors the comprehensive list from Sidebar for consistency.
  // No roles = accessible to all authenticated users.
  { href: "/dashboard", label: "Dashboard" },
  { href: "/interview", label: "Interview", roles: ["Student"] },
  { href: "/analytics", label: "Analytics", roles: ["Student", "Trainer", "Admin"] },
  { href: "/bookmarks", label: "Bookmarks", roles: ["Student"] },
  { href: "/settings", label: "Settings" },
  { href: "/trainer/questions", label: "Trainer", roles: ["Trainer", "Admin"] },
  { href: "/admin/users", label: "Admin", roles: ["Admin"] },
];

function initialsFrom(label?: string) {
  if (!label) return "U";
  const letters = label.replace(/[^a-zA-Z]/g, "");
  if (letters.length >= 2) return (letters[0] + letters[1]).toUpperCase();
  if (letters.length === 1) return letters[0].toUpperCase();
  return label.slice(0, 2).toUpperCase();
}

function UserMenu() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  if (!user) return null;

  const firstLabel = (user.email ?? "").split("@")[0] || "User";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="group inline-flex items-center gap-2 rounded-xl border border-border bg-secondary/60 px-2 py-1.5 text-sm text-foreground hover:bg-secondary focus-ring"
      >
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">
          {initialsFrom(firstLabel)}
        </span>
        <span className="hidden sm:inline text-foreground/90">{firstLabel}</span>
        <ChevronDown size={14} className="opacity-80 group-hover:opacity-100 transition-transform data-[open=true]:rotate-180" data-open={open} />
      </button>

      {open && (
        <>
          {/* Click-catcher below the menu, above the page */}
          <div
            aria-hidden
            className="fixed inset-0 z-[85] bg-black/0"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 mt-2 z-[90] w-56 overflow-hidden rounded-xl surface"
          >
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Signed in as
              <div className="truncate text-foreground">{user.email ?? "unknown"}</div>
            </div>
            <div className="my-1 h-px bg-border" />

            <Link
              role="menuitem"
              href="/dashboard"
              className="block px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              onClick={() => setOpen(false)}
            >
              Dashboard
            </Link>
            <Link
              role="menuitem"
              href="/settings"
              className="block px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              onClick={() => setOpen(false)}
            >
              Settings
            </Link>
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                logout();
                router.push("/login");
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm
                         text-destructive hover:bg-destructive/10"
            >
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  // 3. Filter navigation items based on user role
  const filteredItems = useMemo(() => {
    return ALL_NAV_ITEMS.filter((item) => !item.roles || hasAnyRole(user, item.roles));
  }, [user]);

  const items = useMemo(
    () =>
      filteredItems.map((i) => ({
        ...i,
        active:
          pathname === i.href || (i.href !== "/" && pathname.startsWith(i.href + "/")),
      })),
    [pathname, filteredItems]
  );

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="nav-glass sticky top-0 z-50">
      {/* Skip link for a11y */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2
                   z-[1000] rounded-md bg-primary px-3 py-2 text-primary-foreground
                   focus-ring"
      >
        Skip to content
      </a>

      <div className="container">
        <div className="flex h-14 items-center justify-between">
          {/* Left: Mobile burger + brand */}
          <div className="flex items-center gap-2">
            <button
              className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-secondary/60 hover:bg-secondary focus-ring"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="mobile-menu"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>

            {/* ENHANCED LOGO: Encased Initial 'I' + Gradient Text */}
            <Link href="/" className="ml-1 inline-flex items-center gap-2">
              <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-cyan-500 text-primary-foreground shadow-lg">
                {/* Initial 'I' for Intervue.AI */}
                <span className="font-extrabold text-base leading-none">I</span> 
              </div>
              <span className="bg-gradient-to-r from-brand-400 to-cyan-400 bg-clip-text text-lg font-bold text-transparent">
                Intervue.AI
              </span>
              <span className="sr-only">Go to home</span>
            </Link>
          </div>

          {/* Center: primary nav (desktop only) */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
            {items.map((i) => ( // 4. Render filtered items
              <NavLink key={i.href} {...i} />
            ))}
          </nav>

          {/* Right: CTA + theme + auth */}
          <div className="flex items-center gap-2">
            {/* 5. Conditionally render desktop "Start" button for Students */}
            {hasAnyRole(user, ["Student"]) && (
              <Link
                href="/interview"
                className="hidden sm:inline-flex btn-primary"
                title="Start interview"
              >
                Start
              </Link>
            )}
            <ThemeToggle />
            {user ? (
              <UserMenu />
            ) : (
              <>
                <Link href="/login" className="hidden sm:inline-flex btn-secondary">
                  Sign in
                </Link>
                <Link href="/signup" className="hidden sm:inline-flex btn-primary">
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Mobile panel */}
        {open && (
          <div className="md:hidden pb-3" id="mobile-menu">
            <nav className="grid gap-1 rounded-2xl surface p-2" aria-label="Mobile">
              {items.map((i) => ( // 6. Render filtered items in mobile menu
                <NavLink key={i.href} {...i} onClick={() => setOpen(false)} />
              ))}

              <div className="my-2 h-px bg-border" />

              {user ? (
                <>
                  <Link
                    href="/dashboard"
                    onClick={() => setOpen(false)}
                    className="rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/settings"
                    onClick={() => setOpen(false)}
                    className="rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  >
                    Settings
                  </Link>
                  <button
                    onClick={() => {
                      setOpen(false);
                      logout();
                      router.push("/login");
                    }}
                    className="rounded-xl px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/signup"
                    onClick={() => setOpen(false)}
                    className="rounded-xl btn-primary"
                  >
                    Sign up
                  </Link>
                </>
              )}

              {/* 7. Conditionally render mobile "Start interview" link for Students */}
              {hasAnyRole(user, ["Student"]) && (
                <Link
                  href="/interview"
                  onClick={() => setOpen(false)}
                  className="mt-1 inline-flex btn-primary"
                >
                  Start interview
                </Link>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}