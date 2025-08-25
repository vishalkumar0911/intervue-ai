"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Menu, X } from "lucide-react";

type Item = { href: string; label: string };

const NAV_ITEMS: Item[] = [
  { href: "/interview", label: "Interview" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/analytics", label: "Analytics" },
  { href: "/settings", label: "Settings" },
];

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={[
        "relative rounded-lg px-2 py-1 text-sm transition-colors",
        active
          ? "text-slate-900 dark:text-white"
          : "text-slate-700 hover:text-slate-900 dark:text-white/80 dark:hover:text-white",
      ].join(" ")}
    >
      {label}
      {active && (
        <span className="pointer-events-none absolute inset-x-1 -bottom-1 h-[2px] rounded-full bg-gradient-to-r from-brand-400 to-accent-400" />
      )}
    </Link>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const items = useMemo(
    () => NAV_ITEMS.map((i) => ({ ...i, active: pathname === i.href })),
    [pathname]
  );

  return (
    <header className="sticky top-0 z-50 border-b border-black/10 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/70 dark:border-white/10 dark:bg-black/20">
      <div className="mx-auto w-full max-w-7xl px-4 md:px-6">
        <div className="flex h-14 items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-xl border border-black/10 bg-black/[0.04] hover:bg-black/[0.06] dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>

            <Link href="/" className="ml-1">
              <span className="bg-gradient-to-r from-brand-400 to-accent-400 bg-clip-text text-lg font-bold text-transparent">
                Intervue.AI
              </span>
            </Link>
          </div>

          <nav className="hidden md:flex items-center gap-2">
            {items.map((i) => (
              <NavLink key={i.href} {...i} />
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/interview"
              className="hidden sm:inline-flex items-center justify-center rounded-xl bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500 transition-colors"
              title="Start interview"
            >
              Start
            </Link>
            <ThemeToggle />
          </div>
        </div>

        {open && (
          <div className="md:hidden pb-3">
            <nav className="grid gap-1 rounded-2xl border border-black/10 bg-white p-2 dark:border-white/10 dark:bg-white/5">
              {items.map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  onClick={() => setOpen(false)}
                  className={[
                    "rounded-xl px-3 py-2 text-sm transition-colors",
                    i.active
                      ? "bg-black/5 text-slate-900 dark:bg-white/10 dark:text-white"
                      : "text-slate-700 hover:bg-black/5 hover:text-slate-900 dark:text-white/80 dark:hover:bg-white/10 dark:hover:text-white",
                  ].join(" ")}
                >
                  {i.label}
                </Link>
              ))}
              <Link
                href="/interview"
                onClick={() => setOpen(false)}
                className="mt-1 inline-flex items-center justify-center rounded-xl bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500 transition-colors"
              >
                Start interview
              </Link>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
