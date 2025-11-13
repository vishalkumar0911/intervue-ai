// src/components/shell/SidebarShell.tsx
"use client";

import { usePathname } from "next/navigation";
import Sidebar, { SidebarProvider } from "./Sidebar";

export default function SidebarShell() {
  const pathname = usePathname() || "";

  // all pages that SHOULD display the sidebar
  const ALLOWED = [
    "/dashboard",
    "/interview",
    "/analytics",
    "/settings",
    "/bookmarks",
    "/trainer",            // covers /trainer and /trainer/questions
    "/admin",              // covers /admin/users and /admin/health
  ];

  // normalize: remove trailing slashes
  const normalizedPath = pathname.replace(/\/+$/, "");

  const show = ALLOWED.some((p) =>
    normalizedPath === p || normalizedPath.startsWith(p + "/")
  );

  if (!show) return null;

  return (
    <SidebarProvider>
      <Sidebar />
    </SidebarProvider>
  );
}
