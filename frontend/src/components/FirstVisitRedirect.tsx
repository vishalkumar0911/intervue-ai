// frontend/src/components/FirstVisitRedirect.tsx
"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

const SESSION_FLAG = "app:first-visit-seen";

/**
 * Any route that should NEVER trigger a redirect, including dynamic ones.
 * Use "startsWith" so /reset-password/<token> is covered.
 */
const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
];

export default function FirstVisitRedirect() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname() || "/";
  const ran = useRef(false); // ensure we run at most once per mount

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (ran.current) return;          // don't re-run after first decision
    if (loading) return;              // wait for auth/session to hydrate

    // Never redirect on public/auth pages (incl. /reset-password/[token])
    const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
    if (isPublic) return;

    const seen = sessionStorage.getItem(SESSION_FLAG);

    if (!seen) {
      sessionStorage.setItem(SESSION_FLAG, "1");
      if (!user) {
        ran.current = true;
        router.replace("/login");
      }
    }
  }, [loading, user, pathname, router]);

  return null;
}
