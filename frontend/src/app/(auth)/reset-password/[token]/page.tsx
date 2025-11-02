"use client";

import { useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Card } from "@/components/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { toast } from "sonner";
import * as demoAuth from "@/lib/auth";

function validPassword(pw: string) {
  // simple & practical: 8+ chars
  return pw.trim().length >= 8;
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useParams();
  const search = useSearchParams();

  // Get token from route segment OR ?token= query fallback
  const tokenFromRoute = Array.isArray(params?.token)
    ? params.token[0]
    : (params?.token as string) || "";
  const token = tokenFromRoute || (search.get("token") ?? "");

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = !!token && validPassword(pw) && pw === pw2 && !loading;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return toast.error("Invalid or missing reset token.");
    if (!validPassword(pw)) return toast.error("Password must be at least 8 characters.");
    if (pw !== pw2) return toast.error("Passwords do not match.");

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, new_password: pw }),
      });

      if (!res.ok) throw new Error("Reset failed");
      const { email } = (await res.json()) as { ok: boolean; email: string };

      // Update the demo/local auth store so the local account has the new password
      await demoAuth.updatePasswordLocal(email, pw);

      toast.success("Password updated. You can sign in now.");
      router.push("/login");
    } catch {
      toast.error("Reset link is invalid or has expired.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Reset password</h1>
        <p className="text-sm text-muted-foreground">
          Enter a new password for your account.
        </p>
      </div>

      {!token && (
        <p className="mt-4 text-sm text-destructive">
          The reset link is missing or malformed. Please request a new one.
        </p>
      )}

      <form onSubmit={onSubmit} aria-busy={loading} className="mt-6 space-y-4">
        <Input
          label="New password"
          type="password"
          placeholder="••••••••"
          autoComplete="new-password"
          required
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
        <Input
          label="Confirm new password"
          type="password"
          placeholder="••••••••"
          autoComplete="new-password"
          required
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
        />

        <div className="text-xs text-muted-foreground">
          At least 8 characters. Use a mix of letters, numbers, and symbols for better security.
        </div>

        <div className="pt-1">
          <Button type="submit" isLoading={loading} disabled={!canSubmit} className="w-full">
            Set new password
          </Button>
        </div>
      </form>
    </Card>
  );
}
