"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useAuth } from "@/components/auth/AuthProvider";
import { updateProfile } from "@/lib/auth";

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [name, setName]   = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole]   = useState("");
  const [saving, setSaving] = useState(false);

  // Prefill from auth
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
      updateProfile({ name: name.trim(), role: role.trim() || undefined });
      toast.success("Profile updated");
    } catch (err: any) {
      toast.error(err?.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <form onSubmit={onSave} className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
        <div>
          <label className="block text-sm text-white/70 mb-1">Display name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-transparent px-3 py-2 outline-none focus:border-brand-400/60"
            placeholder="Your name"
            required
          />
        </div>

        <div>
          <label className="block text-sm text-white/70 mb-1">Email</label>
          <input
            value={email}
            readOnly
            disabled
            className="w-full rounded-xl border border-white/10 bg-transparent px-3 py-2 text-white/80"
          />
        </div>

        <div>
          <label className="block text-sm text-white/70 mb-1">Preferred role (optional)</label>
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-transparent px-3 py-2 outline-none focus:border-brand-400/60"
            placeholder="e.g. Backend Developer"
          />
        </div>

        <button
          disabled={saving}
          className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium hover:bg-brand-500 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
      </form>
    </div>
  );
}
