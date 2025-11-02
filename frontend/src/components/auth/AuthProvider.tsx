// src/components/auth/AuthProvider.tsx
"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
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

  const { data: session, status } = useSession();

  
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
    const s = await getSession();
    if (s?.user?.email) {
      setUser(userFromSession(s));
    } else {
      setUser(auth.getUser());
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
