"use client";

import RequireRole from "@/components/auth/RequireRole";
import { Card } from "@/components/Card";
import { Button } from "@/components/ui/Button";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, RefreshCw, Plus, Trash2, Settings as Cog } from "lucide-react";

/**
 * Admin starter
 * - Fake in-memory list so the UI is demo-ready without backend work.
 * - Swap the loaders with real API calls later.
 */
type DemoUser = {
  id: string;
  name: string;
  email: string;
  role: "Student" | "Trainer" | "Admin";
  createdAt: number;
};

export default function AdminPage() {
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  // demo bootstrap
  useEffect(() => {
    // pretend-load users
    setLoading(true);
    const demo: DemoUser[] = [
      { id: "u1", name: "Ada Lovelace", email: "ada@example.com", role: "Admin", createdAt: Date.now() - 86400000 },
      { id: "u2", name: "Alan Turing", email: "alan@example.com", role: "Trainer", createdAt: Date.now() - 172800000 },
      { id: "u3", name: "Grace Hopper", email: "grace@example.com", role: "Student", createdAt: Date.now() - 3600000 },
    ];
    const t = setTimeout(() => { setUsers(demo); setLoading(false); }, 300);
    return () => clearTimeout(t);
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return users;
    return users.filter(u =>
      u.name.toLowerCase().includes(s) ||
      u.email.toLowerCase().includes(s) ||
      u.role.toLowerCase().includes(s)
    );
  }, [users, q]);

  function addDemoUser() {
    const id = crypto.randomUUID();
    const u: DemoUser = {
      id,
      name: `User ${users.length + 1}`,
      email: `user${users.length + 1}@example.com`,
      role: "Student",
      createdAt: Date.now(),
    };
    setUsers(prev => [u, ...prev]);
    toast.success("User created (demo)");
  }

  function remove(id: string) {
    setUsers(prev => prev.filter(u => u.id !== id));
    toast("User removed (demo)");
  }

  function syncNow() {
    // replace with real refresh
    toast.message("Sync started");
  }

  return (
    <RequireRole roles={["Admin"]} mode="inline">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Admin</h1>
            <p className="text-muted-foreground">Manage users & global settings.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={syncNow} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Sync
            </Button>
            <Button onClick={addDemoUser} className="gap-2">
              <Plus className="h-4 w-4" /> New user
            </Button>
          </div>
        </div>

        {/* System overview */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <p className="text-sm text-muted-foreground">Total users</p>
            <p className="mt-1 text-2xl font-semibold">{users.length}</p>
          </Card>
          <Card>
            <p className="text-sm text-muted-foreground">Admins</p>
            <p className="mt-1 text-2xl font-semibold">{users.filter(u => u.role === "Admin").length}</p>
          </Card>
          <Card>
            <p className="text-sm text-muted-foreground">Trainers</p>
            <p className="mt-1 text-2xl font-semibold">{users.filter(u => u.role === "Trainer").length}</p>
          </Card>
        </div>

        {/* Users table */}
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name / email / role…"
                className="w-72 rounded-xl border border-input bg-transparent pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus-ring"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td className="px-3 py-6 text-muted-foreground" colSpan={5}>Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td className="px-3 py-6 text-muted-foreground" colSpan={5}>No users found.</td></tr>
                ) : (
                  filtered.map(u => (
                    <tr key={u.id} className="hover:bg-secondary/50">
                      <td className="px-3 py-2">{u.name}</td>
                      <td className="px-3 py-2">{u.email}</td>
                      <td className="px-3 py-2">{u.role}</td>
                      <td className="px-3 py-2">{new Date(u.createdAt).toLocaleString()}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" className="gap-2">
                            <Cog className="h-4 w-4" /> Edit
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => remove(u.id)} aria-label="Remove">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </RequireRole>
  );
}
