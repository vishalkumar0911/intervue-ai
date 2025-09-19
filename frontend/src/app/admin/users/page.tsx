"use client";
import { RequireRole } from "@/components/auth/RequireRole";

export default function AdminUsersPage() {
  return (
    <RequireRole allow="Admin" fallback="/dashboard">
      <h1 className="text-2xl font-semibold">User Management</h1>
      <p className="text-muted-foreground">Admin-only area.</p>
    </RequireRole>
  );
}
