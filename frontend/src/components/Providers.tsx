"use client";

import React from "react";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SidebarProvider } from "@/components/shell/Sidebar";
import { SessionProvider } from "next-auth/react";
import { AuthProvider } from "@/components/auth/AuthProvider";
import FirstVisitRedirect from "@/components/FirstVisitRedirect";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"            // toggles .dark on <html>
      defaultTheme="system"        // matches OS on first paint
      enableSystem
      disableTransitionOnChange    // avoids flash when switching
      storageKey="intervue-theme"  // persistent + scoped key
    >
      <SessionProvider>
      <AuthProvider>
        <SidebarProvider>
          <FirstVisitRedirect />
          {children}
        </SidebarProvider>
      </AuthProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
