"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/AuthProvider";
import { updateProfile } from "@/lib/auth";

export default function SignupPage() {
  const router = useRouter();
  const { signup } = useAuth();
  const [name, setName]       = useState("");
  const [email, setEmail]     = useState("");
  const [role, setRole]       = useState("");
  const [pass, setPass]       = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pass !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await signup(name.trim(), email.trim(), pass, role.trim());
      if (role.trim()) updateProfile({ role: role.trim() });
      toast.success("Account created!");
      router.push("/dashboard");
    } catch (e: any) {
      toast.error(e?.message || "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          Already have one?{" "}
          <Link href="/login" className="text-primary underline underline-offset-4 hover:opacity-90">
            Sign in
          </Link>
        </p>
      </div>

      <form onSubmit={onSubmit} aria-busy={loading} className="mt-6 space-y-4">
        <Input
          label="Name"
          placeholder="Jane Doe"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          label="Email"
          type="email"
          placeholder="jane@example.com"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div>
          <label className="mb-1 block text-sm text-muted-foreground">
            Select your role
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            required
            className="z-50 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-elevated"
          >
            <option value="" disabled>
              -- Choose a role --
            </option>
            <option value="Student">Student</option>
            <option value="Trainer">Trainer</option>
            <option value="Admin">Admin</option>
          </select>
</div>


        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            minLength={8}
            required
            value={pass}
            onChange={(e) => setPass(e.target.value)}
          />
          <Input
            label="Confirm password"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            minLength={8}
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>

        <div className="pt-1">
          <Button type="submit" isLoading={loading} className="w-full">
            Create account
          </Button>
        </div>
      </form>
    </Card>
  );
}
