"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card } from "@/components/Card";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";

const ROLES = ["Student", "Trainer", "Admin"] as const;

export default function ChooseRolePage() {
  const router = useRouter();
  const search = useSearchParams();
  const { user, loading, refresh } = useAuth();
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState<string>("");
  const next = search.get("next") || "/dashboard";

  useEffect(() => {
    if (loading) return;
    if (user?.role) router.replace(next);
  }, [loading, user?.role, router, next]);

  async function onSave() {
    if (!role) return toast.error("Pick a role first");
    setSaving(true);
    try {
      const res = await fetch("/api/auth/role", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error(await res.text());

      toast.success(`Role set to ${role}`);
      try { localStorage.setItem("auth:role-override", role); } catch {}
      refresh();
      router.replace(next);
    } catch (e: any) {
      toast.error(e?.message || "Failed to set role");
    } finally {
      setSaving(false);
    }
  }

  if (loading || user?.role) {
    return <div className="flex h-[50vh] items-center justify-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <h1 className="text-2xl font-semibold">Choose your role</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pick how you’ll use Intervue.AI.</p>

        <div className="mt-4 grid gap-2">
          {ROLES.map((r) => (
            <label key={r} className="flex items-center gap-3 rounded-xl border border-border bg-secondary/50 p-3 hover:bg-secondary">
              <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="accent-brand-500" />
              <span className="font-medium">{r}</span>
            </label>
          ))}
        </div>

        <div className="mt-5">
          <Button onClick={onSave} isLoading={saving} disabled={!role} className="w-full">
            Continue
          </Button>
        </div>
      </Card>
    </div>
  );
}
