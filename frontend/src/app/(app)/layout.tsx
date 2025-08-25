// src/app/(app)/layout.tsx
import type { ReactNode } from "react";
import Sidebar from "@/components/shell/Sidebar";


export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-6 md:grid-cols-[16rem,1fr]">
      <aside className="hidden md:block" role="complementary" aria-label="Primary navigation">
        <div className="sticky top-[56px]">
          <Sidebar />
        </div>
      </aside>

      <section className="min-w-0 px-2 sm:px-0">
        {children}
      </section>
    </div>
  );
}
