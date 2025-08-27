"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { toast } from "sonner";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // Mock: just wait and show success
    setTimeout(() => {
      setLoading(false);
      toast.success("If that email exists, we've sent a reset link.");
      router.push("/login");
    }, 700);
  }

  return (
    <Card>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Forgot password?</h1>
        <p className="text-sm text-white/70">
          Enter your email and we’ll send you instructions to reset your password.
        </p>
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <div className="pt-1">
          <Button disabled={loading} className="w-full">
            {loading ? "Sending..." : "Send reset link"}
          </Button>
        </div>
      </form>

      <p className="mt-4 text-sm text-white/70">
        Remembered your password?{" "}
        <Link href="/login" className="text-brand-300 hover:text-brand-200 underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
