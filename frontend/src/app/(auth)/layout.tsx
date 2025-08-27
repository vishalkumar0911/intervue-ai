import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto min-h-[calc(100dvh-64px)] max-w-7xl px-4 py-10 md:py-16">
      {/* Background — reuses your project aesthetic */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 opacity-[.35] dark:opacity-100 bg-[radial-gradient(1200px_600px_at_50%_-10%,rgba(99,102,241,.20),transparent_60%)]" />
        <div className="absolute inset-0 opacity-[.35] dark:opacity-100 bg-[radial-gradient(40%_60%_at_20%_10%,rgba(99,102,241,.35),transparent_60%),radial-gradient(35%_55%_at_80%_20%,rgba(34,211,238,.25),transparent_60%)]" />
        <div className="absolute inset-0 hidden md:block opacity-[.25] dark:opacity-100 bg-[linear-gradient(to_right,rgba(0,0,0,.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,.04)_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,rgba(255,255,255,.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,.04)_1px,transparent_1px)] bg-[size:28px_28px]" />
      </div>

      <div className="mx-auto w-full max-w-md">
        {children}
      </div>
    </div>
  );
}
