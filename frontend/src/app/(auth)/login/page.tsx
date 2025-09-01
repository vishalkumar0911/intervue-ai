"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/AuthProvider";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [pass, setPass]   = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email.trim(), pass);
      toast.success("Welcome back!");
      router.push("/dashboard");
    } catch (e: any) {
      toast.error(e?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          Don’t have an account?{" "}
          <Link href="/signup" className="text-primary underline underline-offset-4 hover:opacity-90">
            Sign up
          </Link>
        </p>
      </div>

      <form onSubmit={onSubmit} aria-busy={loading} className="mt-6 space-y-4">
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          autoFocus
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label="Password"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          required
          value={pass}
          onChange={(e) => setPass(e.target.value)}
        />

        <p className="text-right text-sm">
          <Link href="/forgot-password" className="text-muted-foreground hover:text-foreground underline underline-offset-4">
            Forgot password?
          </Link>
        </p>

        <div className="pt-1">
          <Button type="submit" isLoading={loading} className="w-full">
            Sign in
          </Button>
        </div>
      </form>

      <div className="mt-6 flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        <span>or</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <Button
        variant="secondary"
        onClick={() => toast.info("Social login not enabled yet")}
        className="mt-3 w-full"
      >
        Continue with Google
      </Button>
    </Card>
  );
}
