// frontend/src/components/shell/SidebarAttributeGuard.tsx
"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * SidebarAttributeGuard
 * Ensures the `data-sidebar` attribute is removed from <html> on routes
 * that do NOT actually render the sidebar. This prevents the left gutter
 * from being reserved when the sidebar isn't mounted.
 *
 * This is defensive and safe — it does not replace SidebarProvider.
 */

const SIDEBAR_ROUTES = [
  "/dashboard",
  "/interview",
  "/analytics",
  "/settings",
  "/bookmarks",
  "/trainer",
  "/admin",
];

export default function SidebarAttributeGuard() {
  const pathname = usePathname() || "";

  useEffect(() => {
    try {
      const normalized = pathname.replace(/\/+$/, "");
      const shouldShow = SIDEBAR_ROUTES.some(
        (p) => normalized === p || normalized.startsWith(p + "/")
      );

      const root = document.documentElement;

      if (!shouldShow) {
        // remove attribute if we are on a route that shouldn't show sidebar
        root.removeAttribute("data-sidebar");
      }
      // if the route should show the sidebar, the SidebarProvider will set the attribute.
    } catch {
      // ignore
    }
  }, [pathname]);

  return null;
}
