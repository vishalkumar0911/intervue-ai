// src/app/(auth)/forgot-password/page.tsx
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
    try {
      // TODO: call your backend reset endpoint when available
      await new Promise((r) => setTimeout(r, 700));
      toast.success("If that email exists, we’ve sent a reset link.");
      router.push("/login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Forgot password?</h1>
        <p className="text-sm text-muted-foreground">
          Enter your email and we’ll send you instructions to reset your password.
        </p>
      </div>

      <form onSubmit={onSubmit} aria-busy={loading} className="mt-6 space-y-4">
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          required
          disabled={loading}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <div className="pt-1">
          <Button type="submit" isLoading={loading} className="w-full">
            Send reset link
          </Button>
        </div>
      </form>

      <p className="mt-4 text-sm text-muted-foreground">
        Remembered your password?{" "}
        <Link
          href="/login"
          className="text-primary underline underline-offset-4 hover:opacity-90"
        >
          Sign in
        </Link>
      </p>
    </Card>
  );
}
