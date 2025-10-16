// src/app/(auth)/forgot-password/page.tsx
"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { toast } from "sonner";

function validateEmail(e: string) {
  const email = e.trim().toLowerCase();
  // Simple, practical email check
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  return re.test(email);
}

function typoSuggestion(email: string) {
  const map: Record<string, string> = {
    "gamil.com": "gmail.com",
    "gmial.com": "gmail.com",
    "gnail.com": "gmail.com",
    "gmal.com": "gmail.com",
    "gmail.co": "gmail.com",
    "gmail.con": "gmail.com",
    "yaho.com": "yahoo.com",
    "hotmai.com": "hotmail.com",
  };
  const at = email.indexOf("@");
  if (at === -1) return null;
  const name = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();
  const fixed = map[domain];
  return fixed ? `${name}@${fixed}` : null;
}

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const isValid = useMemo(() => validateEmail(email), [email]);
  const suggestion = useMemo(() => (email ? typoSuggestion(email) : null), [email]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || loading) return;
    setLoading(true);
    try {
      // Call your Next.js proxy → FastAPI (/auth/forgot)
      await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      }).catch(() => {
        // swallow network error to avoid enumeration; still show success
      });

      // Always show success message regardless of existence of the email
      toast.success("We’ve sent a reset link.");
      router.push("/login");
    } catch {
      // We still avoid leaking whether the email exists; keep generic UX
      toast.success("We’ve sent a reset link.");
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

      <form onSubmit={onSubmit} aria-busy={loading} className="mt-6 space-y-3">
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          autoFocus
          required
          disabled={loading}
          aria-invalid={email.length > 0 && !isValid}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        {/* Optional: smart domain correction hint */}
        {suggestion && suggestion !== email && (
          <div className="text-xs text-muted-foreground">
            Did you mean{" "}
            <button
              type="button"
              className="underline underline-offset-4 text-primary hover:opacity-90"
              onClick={() => setEmail(suggestion)}
            >
              {suggestion}
            </button>
            ?
          </div>
        )}

        {/* Inline validation hint */}
        {email.length > 0 && !isValid && (
          <div className="text-xs text-destructive">
            Please enter a valid email address.
          </div>
        )}

        <div className="pt-1">
          <Button
            type="submit"
            isLoading={loading}
            disabled={!isValid || loading}
            className="w-full"
          >
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
