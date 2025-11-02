"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { updateProfile } from "@/lib/auth";
import { Card } from "@/components/Card";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";

const ROLES = ["Student", "Trainer", "Admin"] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/dashboard";
  const { user, loading } = useAuth();

  const [role, setRole] = useState<string>("");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent("/onboarding")}`);
      return;
    }
    if (user.role) {
      router.replace(next);
    }
  }, [user, loading, next, router]);

  async function save() {
    if (!role) return;
    updateProfile({ role }); // local demo store
    toast.success("Role saved");
    router.replace(next);
  }

  return (
    <Card>
      <h1 className="text-2xl font-semibold">Pick your role</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        This helps us tailor the experience.
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {ROLES.map((r) => (
          <button
            key={r}
            onClick={() => setRole(r)}
            aria-pressed={role === r}
            className={[
              "rounded-xl border px-3 py-2 text-sm focus-ring",
              role === r ? "border-brand-500 ring-1 ring-brand-500/30 bg-brand-500/10" : "border-border bg-secondary hover:bg-secondary/80"
            ].join(" ")}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="mt-5">
        <Button onClick={save} disabled={!role}>Continue</Button>
      </div>
    </Card>
  );
}
