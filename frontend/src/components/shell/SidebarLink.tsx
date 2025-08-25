"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Icon } from "lucide-react";

export function SidebarLink({
  href,
  icon: Icon,
  label,
  open,
}: {
  href: string;
  icon: Icon;
  label: string;
  open: boolean;
}) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition
      ${active ? "bg-brand-600/20 text-white ring-1 ring-brand-500/30" : "text-white/80 hover:bg-white/5"}`}
    >
      <Icon className={`h-4 w-4 ${active ? "text-brand-300" : "text-white/60 group-hover:text-white/80"}`} />
      <span className={`${open ? "block" : "hidden"} truncate`}>{label}</span>
    </Link>
  );
}
