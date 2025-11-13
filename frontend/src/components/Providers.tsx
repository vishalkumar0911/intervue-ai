"use client";

import React from "react";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SessionProvider } from "next-auth/react";
import { AuthProvider } from "@/components/auth/AuthProvider";
import FirstVisitRedirect from "@/components/FirstVisitRedirect";
import { usePathname } from "next/navigation";

/**
 * NOTE:
 * SidebarProvider was intentionally removed from here so the sidebar state/attribute
 * (data-sidebar) is only present on routes that actually mount the sidebar.
 * The SidebarProvider lives in AppLayout / SidebarShell where the sidebar is used.
 */

const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
];

export default function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname?.startsWith(p));

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="intervue-theme"
    >
      <SessionProvider>
        <AuthProvider>
          {/* Only run redirect logic on non-auth pages */}
          {!isPublic && <FirstVisitRedirect />}
          {children}
        </AuthProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
