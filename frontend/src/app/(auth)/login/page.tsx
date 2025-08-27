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
  const { login } = useAuth();           // ⬅️ use context
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, pass);
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
        <p className="text-sm text-white/70">
          Welcome back. Don’t have an account?{" "}
          <Link href="/signup" className="text-brand-300 hover:text-brand-200 underline underline-offset-4">
            Sign up
          </Link>
        </p>
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Input label="Email" type="email" placeholder="you@example.com" autoComplete="email" required
               value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="Password" type="password" placeholder="••••••••" autoComplete="current-password" required
               value={pass} onChange={(e) => setPass(e.target.value)} />
        <p className="text-right text-sm">
          <Link href="/forgot-password" className="text-white/70 hover:text-white">
            Forgot password?
          </Link>
        </p>
        <div className="pt-1">
          <Button disabled={loading} className="w-full">
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </div>
      </form>

      <div className="mt-6 flex items-center gap-3 text-xs text-white/60">
        <div className="h-px flex-1 bg-white/10" />
        <span>or</span>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      <Button variant="secondary" onClick={() => toast.info("Social login not enabled yet")} className="mt-3 w-full">
        Continue with Google
      </Button>
    </Card>
  );
}
