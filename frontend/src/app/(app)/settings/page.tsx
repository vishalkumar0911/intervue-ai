// src/app/(app)/settings/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useAuth } from "@/components/auth/AuthProvider";
import { updateProfile } from "@/lib/auth";
import { Card } from "@/components/Card";
import { Button } from "@/components/ui/Button";
import RequireRole from "@/components/auth/RequireRole";

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading, refresh } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [saving, setSaving] = useState(false);

  // 🔧 Dev tools flag (compile-time, safe for client)
  const devTools = useMemo(
    () => process.env.NEXT_PUBLIC_DEV_TOOLS === "true",
    []
  );
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedCount, setSeedCount] = useState(10);

  // Prefill from auth (redirect if not logged in)
  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    setName(user.name || "");
    setEmail(user.email || "");
    setRole(user.role || "");
  }, [user, loading, router]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    try {
      setSaving(true);

      // Update local profile (display name stored locally for now)
      updateProfile({ name: name.trim(), role: role.trim() || undefined });

      // Also persist role to backend if provided
      if (role.trim()) {
        const res = await fetch("/api/auth/role", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ role }),
        });

        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(txt || "Failed to update role");
        }
      }

      // 🧹 make sure no stale client override persists
      try {
        localStorage.removeItem("auth:role-override");
      } catch {}

      // Rebuild user from fresh NextAuth session (now carrying backend role)
      await refresh();

      toast.success("Profile updated");
    } catch (err: any) {
      toast.error(err?.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  }

  // 🔧 Seed attempts (dev-only)
  async function seedAttempts() {
    try {
      setSeedLoading(true);
      const res = await fetch(`/api/dev/seed?count=${seedCount}`, {
        // GET is fine for a dev utility; if you implemented POST, flip this:
        method: "GET",
        cache: "no-store",
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Failed to seed attempts");
      }
      const data = await res.json().catch(() => null);
      const added = (data && (data.added ?? data.count ?? seedCount)) || seedCount;
      toast.success(`Seeded ${added} attempt${added === 1 ? "" : "s"}.`);
    } catch (e: any) {
      toast.error(e?.message || "Seeding failed");
    } finally {
      setSeedLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl space-y-6">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <div className="rounded-2xl border border-border bg-card p-6 animate-pulse">
          <div className="h-4 w-40 rounded bg-muted/60" />
          <div className="mt-3 h-10 w-full rounded-xl bg-muted/60" />
          <div className="mt-5 h-4 w-24 rounded bg-muted/60" />
          <div className="mt-3 h-10 w-full rounded-xl bg-muted/60" />
          <div className="mt-5 h-4 w-52 rounded bg-muted/60" />
          <div className="mt-3 h-10 w-full rounded-xl bg-muted/60" />
          <div className="mt-6 h-10 w-32 rounded-xl bg-primary/60" />
        </div>
      </div>
    );
  }

  return (
    <RequireRole roles={["Student", "Trainer", "Admin"]} mode="redirect">
      <div className="max-w-2xl space-y-6">
        <h1 className="text-2xl font-semibold">Settings</h1>

        <Card>
          <form onSubmit={onSave} aria-busy={saving} className="space-y-5">
            {/* Display name */}
            <div>
              <label htmlFor="displayName" className="mb-1 block text-sm text-muted-foreground">
                Display name
              </label>
              <input
                id="displayName"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus-ring"
                placeholder="Your name"
                required
                disabled={saving}
              />
            </div>

            {/* Email (read-only) */}
            <div>
              <label htmlFor="email" className="mb-1 block text-sm text-muted-foreground">
                Email (read-only)
              </label>
              <input
                id="email"
                type="email"
                value={email}
                readOnly
                aria-readonly="true"
                className="w-full rounded-xl border border-input bg-secondary/60 px-3 py-2 text-sm text-muted-foreground cursor-text"
              />
            </div>

            {/* Preferred role */}
            <div>
              <label htmlFor="role" className="mb-1 block text-sm text-muted-foreground">
                Preferred role <span className="opacity-60">(optional)</span>
              </label>
              <input
                id="role"
                type="text"
                autoComplete="organization-title"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus-ring"
                placeholder="e.g. Trainer"
                disabled={saving}
              />
            </div>

            <div className="pt-1">
              <Button type="submit" isLoading={saving}>
                Save changes
              </Button>
            </div>
          </form>
        </Card>

        {/* 🔧 Developer tools (hidden by default) */}
        {devTools && (
          <Card className="space-y-4">
            <div>
              <h2 className="text-sm font-medium text-foreground">Developer tools</h2>
              <p className="text-sm text-muted-foreground">
                Quickly generate demo attempts for charts and dashboards.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="seedCount" className="text-sm text-muted-foreground">
                Count
              </label>
              <input
                id="seedCount"
                type="number"
                min={1}
                max={200}
                value={seedCount}
                onChange={(e) => setSeedCount(Math.max(1, Math.min(200, Number(e.target.value) || 10)))}
                className="w-24 rounded-xl border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus-ring"
              />
              <Button onClick={seedAttempts} isLoading={seedLoading}>
                Seed attempts
              </Button>
            </div>
          </Card>
        )}
      </div>
    </RequireRole>
  );
}
