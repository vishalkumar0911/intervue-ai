"use client";

import React from "react";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SidebarProvider } from "@/components/shell/Sidebar";
import { AuthProvider } from "@/components/auth/AuthProvider";
import FirstVisitRedirect from "@/components/FirstVisitRedirect";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SidebarProvider>
        <ThemeProvider><FirstVisitRedirect />{children}</ThemeProvider>
      </SidebarProvider>
    </AuthProvider>
  );
}
