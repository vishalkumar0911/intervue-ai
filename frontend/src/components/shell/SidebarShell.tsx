"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

export default function SidebarShell() {
  const pathname = usePathname() || "";

  // Pages where sidebar should appear
  const ALLOWED = [
    "/dashboard",
    "/interview",
    "/analytics",
    "/settings",
    "/bookmarks",
    "/trainer",
    "/admin",
  ];

  const normalized = pathname.replace(/\/+$/, "");
  const show = ALLOWED.some((p) => normalized === p || normalized.startsWith(p + "/"));

  // ❗ IMPORTANT: No SidebarProvider here anymore.
  if (!show) return null;

  return <Sidebar />;
}
