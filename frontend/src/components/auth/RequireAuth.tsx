"use client";

import { ReactNode, useEffect } from "react";
import { useAuth } from "./AuthProvider";
import { useRouter, usePathname } from "next/navigation";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      // Optionally remember path to redirect back later
      const next = encodeURIComponent(pathname || "/");
      router.replace(`/login?next=${next}`);
    }
  }, [user, loading, router, pathname]);

  // Splash/loading fallback while checking
  if (loading || (!user && typeof window !== "undefined")) {
    return (
      <div className="flex h-[50vh] items-center justify-center text-white/70">
        Checking session…
      </div>
    );
  }

  return <>{children}</>;
}
