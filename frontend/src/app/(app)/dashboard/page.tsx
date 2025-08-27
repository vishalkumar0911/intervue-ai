// src/app/(app)/dashboard/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { TrendingUp, Clock, Target, Plus, Trash2, Download } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/Card";
import { api, type Attempt, type AttemptCreate } from "@/lib/api";
import { useApi } from "@/lib/useApi";

/* ---------- helpers ---------- */

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    const date = new Intl.DateTimeFormat(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(d);
    const time = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
    return `${date} · ${time}`;
  } catch {
    return iso;
  }
}

function scoreClass(n: number) {
  if (n >= 80) return "text-emerald-300";
  if (n >= 50) return "text-amber-300";
  return "text-rose-300";
}

function KpiSkeleton() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="h-3 w-24 rounded bg-white/10" />
      <div className="mt-3 h-7 w-16 rounded bg-white/10" />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl divide-y divide-white/10 border border-white/10">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between bg-white/[0.03] px-4 py-3">
          <div className="min-w-0">
            <div className="h-4 w-44 rounded bg-white/10" />
            <div className="mt-2 h-3 w-32 rounded bg-white/10" />
          </div>
          <div className="flex items-center gap-6">
            <span className="h-4 w-12 rounded bg-white/10" />
            <span className="h-6 w-10 rounded bg-white/10" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- tiny UI bits ---------- */

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-xl px-3 py-1.5 text-xs transition-colors border",
        active
          ? "bg-brand-600/20 text-white border-brand-400/30"
          : "bg-white/5 text-white/80 border-white/10 hover:bg-white/10",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="text-xs text-white/70 inline-flex items-center gap-2">
      <span className="hidden sm:inline">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm text-white outline-none focus:border-brand-400/50"
      />
    </label>
  );
}

/* ---------- page ---------- */

const SEED_PREFS_KEY = "dashboard:seedPrefs";

export default function DashboardPage() {
  // Load attempts via SWR-like hook
  const {
    data: attempts = [],
    loading,
    error,
    setData, // local mutate
    refetch,
  } = useApi<Attempt[]>(
    ["attempts", "dashboard"],
    () => api.getAttempts({ limit: 200 }),
    { refreshInterval: 60_000, revalidateOnFocus: true, dedupeMs: 200 }
  );

  // Load all roles (so the seed dropdown has options even if there are no attempts yet)
  const [allRolesApi, setAllRolesApi] = useState<string[]>([]);
  useEffect(() => {
    api
      .roles()
      .then((r) => setAllRolesApi(r))
      .catch(() => setAllRolesApi([]));
  }, []);

  // filters
  const allRolesFromData = useMemo(
    () => Array.from(new Set(attempts.map((a) => a.role))).sort(),
    [attempts]
  );
  const allRoles = (allRolesApi.length ? allRolesApi : allRolesFromData).sort();

  const [selectedRoles, setSelectedRoles] = useState<string[]>([]); // empty = all
  const [from, setFrom] = useState<string>(""); // "YYYY-MM-DD"
  const [to, setTo] = useState<string>("");

  // apply filters (newest first in list view)
  const filtered = useMemo(() => {
    const hasRoleFilter = selectedRoles.length > 0;
    const fromTime = from ? new Date(from + "T00:00:00").getTime() : -Infinity;
    const toTime = to ? new Date(to + "T23:59:59").getTime() : Infinity;

    return attempts
      .filter((a) => {
        const t = new Date(a.date).getTime();
        const roleOk = hasRoleFilter ? selectedRoles.includes(a.role) : true;
        const dateOk = t >= fromTime && t <= toTime;
        return roleOk && dateOk;
      })
      .sort((a, b) => +new Date(b.date) - +new Date(a.date));
  }, [attempts, selectedRoles, from, to]);

  // KPIs
  const avg = useMemo(() => {
    if (!filtered.length) return 0;
    return Math.round(filtered.reduce((a, b) => a + b.score, 0) / filtered.length);
  }, [filtered]);

  const totalMin = useMemo(
    () => filtered.reduce((a, b) => a + (b.duration_min || 0), 0),
    [filtered]
  );

  // ---- By-role summary (based on filtered list) ----
  const byRole = useMemo(() => {
    const map = new Map<string, { count: number; totalScore: number; totalMin: number }>();
    for (const a of filtered) {
      const m = map.get(a.role) ?? { count: 0, totalScore: 0, totalMin: 0 };
      m.count += 1;
      m.totalScore += a.score;
      m.totalMin += a.duration_min || 0;
      map.set(a.role, m);
    }
    return Array.from(map.entries())
      .map(([role, m]) => ({
        role,
        count: m.count,
        minutes: m.totalMin,
        avg: Math.round(m.totalScore / m.count),
      }))
      .sort((a, b) => a.role.localeCompare(b.role));
  }, [filtered]);

  // ---------------- Seed controls (with localStorage persistence) ----------------
  const [seedRole, setSeedRole] = useState<string>("");
  const [seedDifficulty, setSeedDifficulty] = useState<"" | "easy" | "medium" | "hard">("");

  // hydrate from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SEED_PREFS_KEY);
      if (raw) {
        const { role, difficulty } = JSON.parse(raw) as {
          role?: string;
          difficulty?: "" | "easy" | "medium" | "hard";
        };
        if (role) setSeedRole(role);
        if (difficulty !== undefined) setSeedDifficulty(difficulty);
      }
    } catch {}
  }, []);

  // ensure chosen role exists; otherwise default to first available
  useEffect(() => {
    if (!allRoles.length) return;
    if (!seedRole || !allRoles.includes(seedRole)) {
      setSeedRole(allRoles[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRoles.join("|")]); // join to avoid changing ref on same content

  // persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        SEED_PREFS_KEY,
        JSON.stringify({ role: seedRole, difficulty: seedDifficulty })
      );
    } catch {}
  }, [seedRole, seedDifficulty]);

  async function seedOne() {
    if (!seedRole) {
      toast.error("Pick a role first");
      return;
    }
    const sample: AttemptCreate = {
      role: seedRole,
      score: 60 + Math.floor(Math.random() * 41),
      duration_min: 12 + Math.floor(Math.random() * 18),
      difficulty: seedDifficulty || undefined,
    };
    try {
      const created = await api.createAttempt(sample);
      setData([created, ...attempts]); // optimistic prepend
      toast.success(`Sample created for ${seedRole}${seedDifficulty ? ` (${seedDifficulty})` : ""}`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to create attempt");
    }
  }

  function exportCSV() {
    // If exactly one role is selected, export just that role
    const oneRole = selectedRoles.length === 1 ? selectedRoles[0] : undefined;
    api.exportCSV({ role: oneRole }).catch(async (e: any) => {
      toast.error(e?.message || "Export failed");
    });
  }

  async function deleteWithUndo(a: Attempt) {
    // Optimistically remove
    setData((prev) => prev?.filter((x) => x.id !== a.id) ?? []);

    const timer = setTimeout(async () => {
      try {
        await api.deleteAttempt(a.id);
      } catch (e: any) {
        toast.error(e?.message || "Delete failed");
        refetch().catch(() => {});
      }
    }, 4000);

    toast(`Deleted “${a.role}”`, {
      description: fmtDate(a.date),
      action: {
        label: "Undo",
        onClick: () => {
          clearTimeout(timer);
          setData((prev) =>
            prev ? [a, ...(prev as Attempt[])].sort((x, y) => +new Date(y.date) - +new Date(x.date)) : [a]
          );
        },
      },
    });
  }

  // quick range helpers
  function setLastDays(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    setFrom(start.toISOString().slice(0, 10));
    setTo(end.toISOString().slice(0, 10));
  }
  function clearRange() {
    setFrom("");
    setTo("");
  }
  function toggleRole(r: string) {
    setSelectedRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }
  function selectAllRoles() {
    setSelectedRoles([]); // empty = All
  }

  return (
    <div className="space-y-8">
      {/* Header + Seed + Export */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
            <span className="bg-gradient-to-r from-white via-white to-white bg-clip-text text-transparent drop-shadow-[0_2px_8px_rgba(0,0,0,0.25)]">
              Welcome back
            </span>
          </h1>
          <p className="mt-1 text-white/75">Here’s a quick overview of your progress.</p>
        </div>

        {/* Seed + export controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Seed role */}
          <select
            value={seedRole}
            onChange={(e) => setSeedRole(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-sm text-white/80 outline-none hover:bg-white/10"
            title="Role to seed"
          >
            {allRoles.map((r) => (
              <option key={r} value={r} className="bg-slate-900 text-white">
                {r}
              </option>
            ))}
          </select>

          {/* Seed difficulty */}
          <select
            value={seedDifficulty}
            onChange={(e) => setSeedDifficulty(e.target.value as any)}
            className="rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-sm text-white/80 outline-none hover:bg-white/10"
            title="Difficulty (optional)"
          >
            <option value="" className="bg-slate-900 text-white">
              Any difficulty
            </option>
            <option value="easy" className="bg-slate-900 text-white">
              easy
            </option>
            <option value="medium" className="bg-slate-900 text-white">
              medium
            </option>
            <option value="hard" className="bg-slate-900 text-white">
              hard
            </option>
          </select>

          <button
            onClick={seedOne}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500"
            title="Create a sample attempt"
          >
            <Plus className="h-4 w-4" /> Seed sample
          </button>

          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
            title="Export attempts as CSV"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-white/60">Roles:</span>
          {allRoles.map((r) => (
            <Chip
              key={r}
              label={r}
              active={selectedRoles.length ? selectedRoles.includes(r) : true}
              onClick={() => {
                if (!selectedRoles.length) setSelectedRoles([r]); // start from this role
                else toggleRole(r);
              }}
            />
          ))}
          <button
            onClick={selectAllRoles}
            className="ml-1 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10"
            title="Show all roles"
          >
            All
          </button>

          <div className="mx-3 h-4 w-px bg-white/10" />

          <DateInput label="From" value={from} onChange={setFrom} />
          <DateInput label="To" value={to} onChange={setTo} />

          <div className="mx-1 h-4 w-px bg-white/10" />

          <button
            onClick={() => setLastDays(7)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10"
          >
            Last 7d
          </button>
          <button
            onClick={() => setLastDays(30)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10"
          >
            Last 30d
          </button>
          <button
            onClick={clearRange}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10"
          >
            All time
          </button>
        </div>
      </div>

      {/* Errors */}
      {error && (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-rose-200">
          {error.message}
        </div>
      )}

      {/* KPIs */}
      <section className="grid gap-4 md:grid-cols-3">
        {loading ? (
          <>
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
          </>
        ) : (
          <>
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/60">Average Score</p>
                  <p className="mt-1 text-2xl font-semibold">{avg}</p>
                </div>
                <TrendingUp className="h-6 w-6 text-accent-400" />
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/60">Sessions</p>
                  <p className="mt-1 text-2xl font-semibold">{filtered.length}</p>
                </div>
                <Target className="h-6 w-6 text-brand-300" />
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/60">Total Minutes</p>
                  <p className="mt-1 text-2xl font-semibold">{totalMin}</p>
                </div>
                <Clock className="h-6 w-6 text-white/70" />
              </div>
            </Card>
          </>
        )}
      </section>

      {/* By role summary */}
      {!loading && byRole.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-lg font-medium">By role</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {byRole.map((r) => (
              <Card key={r.role}>
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.role}</p>
                    <p className="mt-1 text-xs text-white/60">
                      {r.count} session{r.count === 1 ? "" : "s"} • {r.minutes} min
                    </p>
                  </div>
                  <span className={`text-2xl font-bold ${scoreClass(r.avg)}`}>{r.avg}</span>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Recent Sessions (filtered) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Recent Sessions</h2>
          {!loading && (
            <button
              onClick={() => refetch().catch(() => {})}
              className="text-sm text-white/70 underline underline-offset-4 hover:text-white"
              title="Refresh"
            >
              Refresh
            </button>
          )}
        </div>

        {loading ? (
          <ListSkeleton />
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
            No sessions for the selected filters. Adjust Role/Date above or seed more data.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl divide-y divide-white/10 border border-white/10">
            {filtered.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between bg-white/[0.03] px-4 py-3 hover:bg-white/[0.06]"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{a.role}</p>
                  <p className="text-xs text-white/60">{fmtDate(a.date)}</p>
                </div>

                <div className="flex items-center gap-4">
                  <span className="text-sm text-white/70">{a.duration_min} min</span>
                  <span className={`text-xl font-bold ${scoreClass(a.score)}`}>{a.score}</span>

                  <button
                    className="ml-2 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                    title="Delete attempt"
                    onClick={() => deleteWithUndo(a)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
