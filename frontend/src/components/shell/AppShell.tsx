"use client";

import { useState } from "react";
// ⬇️ make sure this path matches where Sidebar.tsx lives
import Sidebar  from "@/components/shell/Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="min-h-screen">
      <div className="flex">
        <Sidebar open={open} onToggle={() => setOpen((v) => !v)} />
        <div className="flex-1 min-w-0 px-4 md:px-6 lg:px-8 py-6">
          {children}
        </div>
      </div>
    </div>
  );
}
