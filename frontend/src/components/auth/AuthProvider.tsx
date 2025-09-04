"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@/lib/auth";
import * as auth from "@/lib/auth";
import { useSession, signOut } from "next-auth/react";   // ← NEW

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string, role?: string) => Promise<void>;
  logout: () => void;
  refresh: () => void;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const { data: session, status } = useSession(); // ← NEW

  const refreshLocal = () => setUser(auth.getUser());

  useEffect(() => {
    // Prefer NextAuth session (Google). Fallback to local auth.
    if (status === "loading") return;

    if (session?.user?.email) {
      setUser({
        id: session.user.email,
        name: session.user.name || session.user.email.split("@")[0],
        email: session.user.email,
      });
      setLoading(false);
      return;
    }

    // fallback: local auth (email/password)
    refreshLocal();
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
    // sign out both worlds
    auth.logout();
    void signOut({ callbackUrl: "/login" }); // NextAuth
    setUser(null);
  }

  return (
    <Ctx.Provider value={{ user, loading, login: doLogin, signup: doSignup, logout: doLogout, refresh: refreshLocal }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
