// src/components/auth/AuthProvider.tsx
"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import type { User } from "@/lib/auth";
import * as auth from "@/lib/auth";
import { useSession, signOut, getSession } from "next-auth/react";

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string, role?: string) => Promise<void>;
  logout: () => void;
  refresh: () => void | Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

function normRole(s?: string | null) {
  return (s || "").trim();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // NOTE: useSession provides `data`, `status` and `update` (update forces a session refresh).
  // `update` may be undefined on older next-auth versions; guard usage accordingly.
  const { data: session, status, update } = useSession();

  const userFromSession = (s: any): User | null => {
    if (!s?.user?.email) return null;
    let role =
      (s.user as any).role ||
      (s as any).role ||
      undefined;

    role = normRole(role);
    return {
      id: (s as any).uid || s.user.email,
      name: s.user.name || s.user.email.split("@")[0],
      email: s.user.email,
      role: role || undefined,
    };
  };

  // Sync initial state based on NextAuth session or local auth fallback.
  useEffect(() => {
    if (status === "loading") return;

    if (session?.user?.email) {
      setUser(userFromSession(session));
      setLoading(false);
      return;
    }

    // fallback: local auth (email/password)
    setUser(auth.getUser());
    setLoading(false);
  }, [session, status]);

  // Keep local state in sync with cross-tab/local changes.
  useEffect(() => {
    // Handler called when lib/auth emits 'auth:changed' or storage changes.
    const onAuthChanged = async () => {
      try {
        // Prefer the refresh flow (NextAuth + local fallback) so any backend-driven role
        // is pulled into the client session. Fall back to local storage read if refresh fails.
        try {
          await refresh();
        } catch (e) {
          const local = auth.getUser();
          if (session?.user?.email) {
            setUser(userFromSession(session));
          } else {
            setUser(local);
          }
        }
      } catch {
        // ignore
      }
    };

    // Cross-tab storage events (other tabs)
    const onStorage = (e: StorageEvent) => {
      if (!e.key) {
        void onAuthChanged();
        return;
      }
      if (e.key.startsWith("auth:")) {
        void onAuthChanged();
      }
    };

    window.addEventListener("auth:changed", onAuthChanged as any);
    window.addEventListener("storage", onStorage as any);

    return () => {
      window.removeEventListener("auth:changed", onAuthChanged as any);
      window.removeEventListener("storage", onStorage as any);
    };
    // include session so we prefer session when it's available
  }, [session]);

  // --- Auto-sync role for local/demo users (poll + focus) ---
  useEffect(() => {
    if (typeof window === "undefined") return;

    let mounted = true;
    let timer: number | null = null;
    const POLL_MS = 15_000; // adjust as desired (dev/demo)

    async function checkAndSyncRole() {
      if (!mounted) return;
      try {
        // If a NextAuth session is present, skip — OAuth users get role via JWT/session.
        if (session?.user?.email) return;

        const localUser = auth.getUser();
        if (!localUser || !localUser.email) return;

        const email = encodeURIComponent(localUser.email);
        // call the server-side proxy route we added
        const res = await fetch(`/api/auth/role?email=${email}`, { cache: "no-store" });
        if (!res.ok) {
          // 404 means backend doesn't know the user; treat as no-op
          return;
        }
        const payload = await res.json().catch(() => null);
        const backendRole = payload?.role ?? undefined;
        const localRole = localUser.role ?? undefined;

        // If backend role differs (including explicit null) update local store
        if ((backendRole ?? undefined) !== (localRole ?? undefined)) {
          try {
            auth.updateRoleLocal(localUser.email, backendRole);
            // re-read and set user in provider so UI updates immediately
            const updated = auth.getUser();
            setUser(updated);
          } catch (e) {
            console.warn("updateRoleLocal failed:", e);
          }
        }
      } catch (e) {
        // non-fatal
      }
    }

    function startPolling() {
      // run immediately then repeat
      void checkAndSyncRole();
      timer = window.setInterval(() => void checkAndSyncRole(), POLL_MS);
    }
    function stopPolling() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    // Start polling only for local/demo users (no NextAuth session)
    if (!loading && !session?.user?.email) {
      startPolling();
    }

    // Also sync on window focus (user may switch tabs after admin change)
    const onFocus = () => void checkAndSyncRole();
    window.addEventListener("focus", onFocus);

    return () => {
      mounted = false;
      stopPolling();
      window.removeEventListener("focus", onFocus);
    };
  }, [session, loading]);

  async function doLogin(email: string, password: string) {
    const u = await auth.login({ email, password });
    setUser(u);
  }

  async function doSignup(name: string, email: string, password: string, role?: string) {
    const u = await auth.signup({ name, email, password, role });
    setUser(u);
  }

  function doLogout() {
    auth.logout();
    try { localStorage.removeItem("auth:role-override"); } catch {}
    void signOut({ callbackUrl: "/login" });
    setUser(null);
  }

  async function refresh() {
    // Re-read current session (includes role set via /api/auth/role) + local override.
    // Strategy:
    // 1) call getSession() to check whether a NextAuth session exists for this client
    // 2) if present and update() is available, call update() to force NextAuth to re-fetch session
    // 3) re-read session via getSession() and set user accordingly
    try {
      const s0 = await getSession(); // newest client session snapshot
      if (s0?.user?.email) {
        if (typeof update === "function") {
          try {
            // request NextAuth to refresh the client session
            await update();
          } catch (uErr) {
            // non-fatal; proceed to read session anyway
            console.warn("NextAuth update() failed:", uErr);
          }
        }
        const s1 = await getSession(); // session after update attempt
        const u = userFromSession(s1 || s0);
        if (u) {
          setUser(u);
          return;
        }
        // If unexpected, fallback to reading local auth storage
        setUser(auth.getUser());
        return;
      }
    } catch (err) {
      console.warn("refresh() getSession/update failed:", err);
    }

    // Fallback path for non-NextAuth or local auth flows
    try {
      setUser(auth.getUser());
    } catch {
      setUser(null);
    }
  }

  return (
    <Ctx.Provider value={{ user, loading, login: doLogin, signup: doSignup, logout: doLogout, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
