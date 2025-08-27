"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

const SESSION_FLAG = "app:first-visit-seen";
const AUTH_ROUTES = new Set(["/login", "/signup", "/forgot-password", "/reset-password"]);

export default function FirstVisitRedirect() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (loading) return; // wait for auth to hydrate

    // Never redirect while already on an auth page
    if (AUTH_ROUTES.has(pathname)) {
      sessionStorage.setItem(SESSION_FLAG, "1");
      return;
    }

    const seen = sessionStorage.getItem(SESSION_FLAG);
    if (!seen) {
      sessionStorage.setItem(SESSION_FLAG, "1");
      if (!user) {
        router.replace("/login");
      }
    }
  }, [loading, user, pathname, router]);

  return null;
}
