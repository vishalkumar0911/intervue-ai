// frontend/src/components/Providers.tsx
"use client";

import React from "react";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SidebarProvider } from "@/components/shell/Sidebar";
import { SessionProvider } from "next-auth/react";
import { AuthProvider } from "@/components/auth/AuthProvider";
import FirstVisitRedirect from "@/components/FirstVisitRedirect";
import { usePathname } from "next/navigation";

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
          <SidebarProvider>
            {/* Only run redirect logic on non-auth pages */}
            {!isPublic && <FirstVisitRedirect />}
            {children}
          </SidebarProvider>
        </AuthProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
