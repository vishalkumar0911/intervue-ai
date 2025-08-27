"use client";

import React from "react";
import Sidebar, { SidebarTrigger, useSidebar } from "@/components/shell/Sidebar";

function LayoutInner({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  const style = { ["--sb" as any]: collapsed ? "72px" : "260px" };

  return (
    <div
      className="mx-auto max-w-7xl gap-4 px-4 py-4 md:grid md:grid-cols-[var(--sb)_1fr]"
      style={style}
    >
      <Sidebar />
      <div>
        <div className="mb-3 flex items-center justify-between md:hidden">
          <SidebarTrigger />
        </div>
        {children}
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // Provider is at RootLayout; just render.
  return <LayoutInner>{children}</LayoutInner>;
}
