"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@/lib/auth";
import * as auth from "@/lib/auth";

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string, role?: string) => Promise<void>; // role optional
  logout: () => void;
  refresh: () => void;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = () => setUser(auth.getUser());

  useEffect(() => {
    // hydrate + subscribe (auth:changed + cross-tab storage)
    refresh();
    setLoading(false);

    const onChange = () => refresh();
    window.addEventListener("auth:changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("auth:changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  async function doLogin(email: string, password: string) {
    const u = await auth.login({ email, password });
    setUser(u);
  }

  async function doSignup(name: string, email: string, password: string, role?: string) {
    const u = await auth.signup({ name, email, password, role }); // pass role through
    setUser(u);
  }

  function doLogout() {
    auth.logout();
    setUser(null);
  }

  return (
    <Ctx.Provider
      value={{ user, loading, login: doLogin, signup: doSignup, logout: doLogout, refresh }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

// Non-throwing variant (optional)
export function useAuthOptional() {
  return useContext(Ctx);
}
