"use client";

import { useEffect, useState } from "react";
import { loadSettings, saveSettings, type UserSettings } from "@/lib/settings";
import { toast } from "sonner";

export default function SettingsPage() {
  const [form, setForm] = useState<UserSettings>({ name: "", email: "" });

  useEffect(() => {
    setForm(loadSettings());
  }, []);

  function onSave() {
    saveSettings(form);
    toast.success("Preferences saved");
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
        <div>
          <label className="block text-sm text-white/70 mb-1">Display name</label>
          <input
            value={form.name}
            onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
            className="w-full rounded-xl border border-white/10 bg-transparent px-3 py-2 outline-none focus:border-brand-400/60"
            placeholder="Your name"
          />
        </div>
        <div>
          <label className="block text-sm text-white/70 mb-1">Email</label>
          <input
            value={form.email}
            onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
            className="w-full rounded-xl border border-white/10 bg-transparent px-3 py-2 outline-none focus:border-brand-400/60"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="block text-sm text-white/70 mb-1">Preferred role (optional)</label>
          <input
            value={form.preferredRole ?? ""}
            onChange={(e) => setForm((s) => ({ ...s, preferredRole: e.target.value || undefined }))}
            className="w-full rounded-xl border border-white/10 bg-transparent px-3 py-2 outline-none focus:border-brand-400/60"
            placeholder="e.g. Frontend Developer"
          />
        </div>

        <button onClick={onSave} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium hover:bg-brand-500">
          Save changes
        </button>
      </div>
    </div>
  );
}
