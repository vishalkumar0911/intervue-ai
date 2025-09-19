// src/components/auth/RequireRole.tsx
"use client";

import { ReactNode, useEffect, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

type Props = {
  roles: string[];                // e.g., ["Student"] or ["Trainer","Admin"]
  mode?: "redirect" | "inline";   // inline = show message instead of redirect
  children: ReactNode;
};

function normRole(s?: string | null) {
  return (s || "").trim().toLowerCase();
}

export default function RequireRole({ roles, mode = "redirect", children }: Props) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const allowed = useMemo(() => roles.map(normRole), [roles]);
  const userRoleNorm = normRole(user?.role);
  const hasRole = !!userRoleNorm && allowed.includes(userRoleNorm);

  useEffect(() => {
    if (loading) return;

    // If signed in but missing role entirely -> ask them to choose one
    if (user && !user.role && mode !== "inline") {
      const next = encodeURIComponent(pathname || "/");
      router.replace(`/choose-role?next=${next}`);
      return;
    }

    // If role present but not allowed -> send to dashboard (or wherever)
    if (user && user.role && !hasRole && mode !== "inline") {
      router.replace("/dashboard");
    }
  }, [user, loading, hasRole, router, pathname, mode]);

  if (loading) {
    return (
      <div className="flex h-[40vh] items-center justify-center text-muted-foreground">
        Checking access…
      </div>
    );
  }

  if (mode === "inline") {
    if (user && !user.role) {
      return (
        <div
          className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-100"
          role="alert"
        >
          You haven’t set a role yet.{" "}
          <button
            onClick={() => router.push(`/choose-role?next=${encodeURIComponent(pathname || "/")}`)}
            className="underline underline-offset-4"
          >
            Choose your role
          </button>{" "}
          to continue.
        </div>
      );
    }
    if (user && user.role && !hasRole) {
      return (
        <div
          className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-900 dark:text-rose-100"
          role="alert"
        >
          Access denied for role <b>{user.role}</b>. Required: {roles.join(", ")}.
        </div>
      );
    }
  }

  return <>{children}</>;
}
