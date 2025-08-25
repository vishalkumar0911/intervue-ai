"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LayoutDashboard, Mic, BarChart2, Settings as SettingsIcon } from "lucide-react";
import clsx from "clsx";

type Item = { href: string; label: string; icon: React.ComponentType<any> };

const NAV: Item[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/interview", label: "Interview", icon: Mic },
  { href: "/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

function Sidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="App navigation"
      className={clsx(
        "rounded-2xl p-3",
        "border border-black/10 bg-white text-slate-900 shadow-sm",
        "dark:border-white/10 dark:bg-white/5 dark:text-white"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-2 pb-3">
        <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 text-white">
          <span className="font-semibold">I</span>
        </div>
        <div className="font-semibold">Intervue.AI</div>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>

      {/* Links */}
      <ul className="mt-1 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href ||
            (href !== "/" && pathname.startsWith(href + "/"));

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
                <span className="truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 rounded-xl border border-black/10 bg-black/[0.03] px-3 py-2 text-xs text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/70">
        Tip: Press <kbd className="rounded bg-black/10 px-1 dark:bg-white/10">N</kbd> for next question
      </div>
    </nav>
  );
}

export { Sidebar };      // named export
export default Sidebar;  // default export (so both import styles work)
