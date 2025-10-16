// src/app/(app)/admin/users/page.tsx
"use client";

import RequireRole from "@/components/auth/RequireRole";
import { Card } from "@/components/Card";
import { Button } from "@/components/ui/Button";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, RefreshCw, Download } from "lucide-react";
import { api } from "@/lib/api";
import { useSession } from "next-auth/react";

/* ---------------- Types ---------------- */

type UserRow = {
  id: string;
  name: string;
  email: string;
  role?: "Student" | "Trainer" | "Admin" | null;
};

type AuditEvent = {
  ts: number;
  type: "role_change";
  email: string;
  before?: string | null;
  after?: string | null;
};

/* ---------------- UI helpers ---------------- */

// rank for sorting: Admin > Trainer > Student > none
const roleRank: Record<NonNullable<UserRow["role"]>, number> = {
  Admin: 0,
  Trainer: 1,
  Student: 2,
};
const getRank = (r: UserRow["role"]) => (r ? roleRank[r] ?? 999 : 999);

function RoleBadge({ role }: { role: UserRow["role"] }) {
  const base = "inline-flex items-center rounded-md border px-2 py-0.5 text-xs";
  if (role === "Admin") return <span className={`${base} border-purple-400/40`}>Admin</span>;
  if (role === "Trainer") return <span className={`${base} border-emerald-400/40`}>Trainer</span>;
  if (role === "Student") return <span className={`${base} border-blue-400/40`}>Student</span>;
  return <span className={`${base} border-border/60 text-muted-foreground`}>— none —</span>;
}

/* ---------------- Page ---------------- */

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const myEmail = session?.user?.email || "";

  const [rows, setRows] = useState<UserRow[]>([]);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "Student" | "Trainer" | "Admin" | "none">("all");
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Seed controls
  const [seeding, setSeeding] = useState(false);
  const [seedCount, setSeedCount] = useState(20);
  const [seedRole, setSeedRole] = useState<string>("");

  // Roles list for the seeding dropdown
  const [roles, setRoles] = useState<string[]>([]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [q]);

  async function load() {
    setLoading(true);
    try {
      const data = await api.admin.listUsers();
      setRows((data || []) as UserRow[]);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  async function loadAudit() {
    setAuditLoading(true);
    try {
      const res = await fetch("/api/admin/audit?limit=25", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as AuditEvent[];
      setAudit(data ?? []);
    } catch (e: any) {
      // non-blocking
      console.warn("audit load failed:", e?.message);
    } finally {
      setAuditLoading(false);
    }
  }

  // load users + audit initially
  useEffect(() => {
    void load();
    void loadAudit();
  }, []);

  // load roles once (for seeding dropdown)
  useEffect(() => {
    (async () => {
      try {
        const r = await api.roles();
        setRoles(r || []);
      } catch {
        // non-blocking
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    // filter
    let list = rows.filter((u) => {
      if (roleFilter !== "all") {
        if (roleFilter === "none") {
          if (u.role != null) return false;
        } else {
          if (u.role !== roleFilter) return false;
        }
      }
      if (!debouncedQ) return true;
      return (
        u.name.toLowerCase().includes(debouncedQ) ||
        u.email.toLowerCase().includes(debouncedQ) ||
        (u.role || "").toLowerCase().includes(debouncedQ)
      );
    });

    // sort: Admin > Trainer > Student > none, then by name
    list = [...list].sort((a, b) => {
      const ra = getRank(a.role);
      const rb = getRank(b.role);
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

    return list;
  }, [rows, debouncedQ, roleFilter]);

  async function changeRole(user: UserRow, newRole: UserRow["role"]) {
    if (savingId) return;

    // Guard: don't allow demoting yourself from Admin
    const isSelf = user.email === myEmail;
    if (isSelf && user.role === "Admin" && newRole !== "Admin") {
      toast.error("You cannot remove your own Admin role.");
      return;
    }

    setSavingId(user.id);
    const prev = user.role;
    // optimistic
    setRows((prevRows) => prevRows.map((r) => (r.id === user.id ? { ...r, role: newRole } : r)));

    try {
      // PATCH via Next proxy → FastAPI /admin/users { email, role }
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: user.email, role: newRole }),
      });
      if (!res.ok) throw new Error(await res.text());
      await res.json();

      toast.success(`Role updated to ${newRole ?? "none"}`);
      // refresh audit
      void loadAudit();
    } catch (e: any) {
      // rollback on failure
      setRows((prevRows) => prevRows.map((r) => (r.id === user.id ? { ...r, role: prev } : r)));
      toast.error(e?.message || "Failed to update role");
    } finally {
      setSavingId(null);
    }
  }

  async function seedAttempts() {
    // validate
    const count = Number.isFinite(seedCount) ? Math.max(1, Math.min(500, seedCount)) : 20;
    if (count !== seedCount) setSeedCount(count);

    setSeeding(true);
    try {
      const res = await fetch("/api/admin/seed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          count,                     // 1..500 supported by backend
          seed: 42,                  // deterministic if you like
          role: seedRole || undefined, // optional role restriction
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      toast.success(`Seeded ${data.created ?? count} attempts`);
      // optional: refresh audit to show seeding activity if you log it later
      void loadAudit();
    } catch (e: any) {
      toast.error(e?.message || "Seeding failed");
    } finally {
      setSeeding(false);
    }
  }

  function exportCsv() {
    const rowsCsv = [
      ["id", "name", "email", "role"],
      ...filtered.map((u) => [u.id, u.name, u.email, u.role ?? ""]),
    ];
    const csv = rowsCsv.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "users.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <RequireRole roles={["Admin"]} mode="redirect">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Users</h1>
            <p className="text-muted-foreground">Manage roles and access.</p>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={exportCsv} className="gap-2">
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button variant="secondary" onClick={load} isLoading={loading} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
          </div>
        </div>

        {/* Users table */}
        <Card>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name / email / role…"
                className="w-72 rounded-xl border border-input bg-transparent pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus-ring"
              />
            </div>

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as any)}
              className="rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus-ring"
            >
              <option value="all" className="bg-background text-foreground">All roles</option>
              <option value="Admin" className="bg-background text-foreground">Admin</option>
              <option value="Trainer" className="bg-background text-foreground">Trainer</option>
              <option value="Student" className="bg-background text-foreground">Student</option>
              <option value="none" className="bg-background text-foreground">No role</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr>
                    <td className="px-3 py-6 text-muted-foreground" colSpan={4}>Loading…</td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-muted-foreground" colSpan={4}>No users match your filters.</td>
                  </tr>
                ) : (
                  filtered.map((u) => {
                    const isSelf = u.email === myEmail;
                    const lockSelfDemotion = isSelf && u.role === "Admin"; // cannot change away from Admin
                    return (
                      <tr key={u.id} className="hover:bg-secondary/50">
                        <td className="px-3 py-2">{u.name}</td>
                        <td className="px-3 py-2">{u.email}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <RoleBadge role={u.role ?? null} />
                            <select
                              value={u.role ?? ""}
                              onChange={(e) => changeRole(u, (e.target.value || null) as any)}
                              className="rounded-xl border border-input bg-background px-2 py-1 text-sm text-foreground focus-ring"
                              disabled={savingId === u.id || (lockSelfDemotion && (u.role ?? "") !== "Admin")}
                            >
                              <option value="" className="bg-background text-foreground">— none —</option>
                              <option value="Student" className="bg-background text-foreground">Student</option>
                              <option value="Trainer" className="bg-background text-foreground">Trainer</option>
                              <option value="Admin" className="bg-background text-foreground">Admin</option>
                            </select>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end">
                            <Button size="sm" variant="outline" disabled>
                              {savingId === u.id ? "Saving…" : "—"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Seed attempts (Admin-only helper) */}
        <Card>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-sm font-medium text-foreground">Seed attempts</h2>
              <p className="text-xs text-muted-foreground">
                Create demo attempts for charts/testing (server-side).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Count input */}
              <label className="text-sm">
                <span className="mr-2 text-muted-foreground">Count</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={seedCount}
                  onChange={(e) =>
                    setSeedCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))
                  }
                  className="w-24 rounded-xl border border-input bg-background px-3 py-2 text-sm focus-ring"
                />
              </label>

              {/* Optional role dropdown (populated from API) */}
              <label className="text-sm">
                <span className="ml-2 mr-2 text-muted-foreground">Only role</span>
                <select
                  value={seedRole}
                  onChange={(e) => setSeedRole(e.target.value)}
                  className="w-64 rounded-xl border border-input bg-background px-3 py-2 text-sm focus-ring"
                >
                  <option value="">(all roles)</option>
                  {roles.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </label>

              <Button onClick={seedAttempts} isLoading={seeding} className="ml-2">
                Seed attempts
              </Button>
            </div>
          </div>
        </Card>

        {/* Recent changes / audit */}
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium text-foreground">Recent changes</h2>
            <Button variant="ghost" size="sm" onClick={loadAudit} isLoading={auditLoading} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
          </div>

          {audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent changes.</p>
          ) : (
            <ul className="divide-y divide-border">
              {audit.map((e, i) => (
                <li key={`${e.ts}-${i}`} className="py-2 px-2 text-sm">
                  <span className="font-medium">{e.email}</span> role changed{" "}
                  <span className="text-muted-foreground">{e.before ?? "none"}</span>
                  {" → "}
                  <span className="font-medium">{e.after ?? "none"}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {new Date(e.ts * 1000).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </RequireRole>
  );
}
