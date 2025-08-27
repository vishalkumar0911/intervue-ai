"use client";

import { useEffect, useMemo, useState } from "react";
import { TrendingUp, Clock, Target, Plus, Download, RotateCcw, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { Card } from "@/components/Card";
import { api, type Attempt, type AttemptCreate } from "@/lib/api";

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

function difficultyPill(d?: string | null) {
  if (!d) return "";
  if (d === "easy") return "bg-emerald-500/15 text-emerald-300 ring-emerald-400/20";
  if (d === "medium") return "bg-amber-500/15 text-amber-300 ring-amber-400/20";
  if (d === "hard") return "bg-rose-500/15 text-rose-300 ring-rose-400/20";
  return "bg-white/10 text-white/70 ring-white/10";
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
      {Array.from({ length: 6 }).map((_, i) => (
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
  disabled = false,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        "rounded-xl px-3 py-1.5 text-xs transition-colors border",
        disabled
          ? "opacity-50 cursor-not-allowed border-white/10"
          : active
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

/* ----------- inline sparkline (pure SVG) ----------- */

function Sparkline({ values, width = 84, height = 28, stroke = "url(#sparkGrad)" }: { values: number[]; width?: number; height?: number; stroke?: string }) {
  const n = values.length;
  if (n < 2) {
    return <svg width={width} height={height} aria-hidden />;
  }
  const min = 0;
  const max = 100;
  const dx = width / (n - 1);
  const points = values.map((v, i) => {
    const x = i * dx;
    const y = height - ((v - min) / (max - min)) * height;
    return `${x},${Math.max(0, Math.min(height, y))}`;
  });
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="-mr-1">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        points={points.join(" ")}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ---------- page ---------- */

const FILTERS_KEY = "dashboard:filters:v1";

export default function DashboardPage() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [rolesFromApi, setRolesFromApi] = useState<string[]>([]);
  const [seedRole, setSeedRole] = useState<string>("");
  const [seedDifficulty, setSeedDifficulty] = useState<"" | "easy" | "medium" | "hard">("");

  // filters
  const allRoles = useMemo(
    () => Array.from(new Set(attempts.map((a) => a.role))).sort(),
    [attempts]
  );
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]); // empty = all
  const [from, setFrom] = useState<string>(""); // "YYYY-MM-DD"
  const [to, setTo] = useState<string>("");

  // pagination
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  // restore filters from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FILTERS_KEY);
      if (raw) {
        const f = JSON.parse(raw) as {
          roles: string[];
          from: string;
          to: string;
          page: number;
        };
        if (Array.isArray(f.roles)) setSelectedRoles(f.roles);
        if (typeof f.from === "string") setFrom(f.from);
        if (typeof f.to === "string") setTo(f.to);
        if (typeof f.page === "number") setPage(Math.max(1, f.page));
      }
    } catch {}
  }, []);

  // persist filters
  useEffect(() => {
    try {
      localStorage.setItem(
        FILTERS_KEY,
        JSON.stringify({ roles: selectedRoles, from, to, page })
      );
    } catch {}
  }, [selectedRoles, from, to, page]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const data = await api.getAttempts({ limit: 400 });
      setAttempts(data.sort((a, b) => +new Date(b.date) - +new Date(a.date)));
      const rs = await api.roles();
      setRolesFromApi(rs);
      setSeedRole((prev) => (prev || rs[0] || ""));
    } catch (e: any) {
      setErr(e?.message || "Failed to load attempts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // apply filters
  const filtered = useMemo(() => {
    const hasRoleFilter = selectedRoles.length > 0;
    const fromTime = from ? new Date(from + "T00:00:00").getTime() : -Infinity;
    const toTime = to ? new Date(to + "T23:59:59").getTime() : Infinity;

    return attempts.filter((a) => {
      const t = new Date(a.date).getTime();
      const roleOk = hasRoleFilter ? selectedRoles.includes(a.role) : true;
      const dateOk = t >= fromTime && t <= toTime;
      return roleOk && dateOk;
    });
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

  // per-role summary + sparkline data
  const perRole = useMemo(() => {
    const map = new Map<string, { sum: number; n: number; scores: number[] }>();
    for (const a of filtered.slice().reverse()) {
      const cur = map.get(a.role) ?? { sum: 0, n: 0, scores: [] };
      cur.sum += a.score;
      cur.n += 1;
      // collect up to 12 most recent scores (we reversed to ascend by date)
      if (cur.scores.length < 12) cur.scores.push(a.score);
      map.set(a.role, cur);
    }
    const rows = Array.from(map.entries()).map(([role, v]) => ({
      role,
      avg: Math.round(v.sum / v.n),
      sessions: v.n,
      spark: v.scores, // already chronological
    }));
    rows.sort((a, b) => b.sessions - a.sessions);
    return rows;
  }, [filtered]);

  // pagination (client side)
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(Math.max(1, page), totalPages);
  const paged = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  // seeding
  async function seedOne() {
    const r = seedRole || rolesFromApi[0];
    if (!r) {
      setErr("No roles found to seed");
      return;
    }
    const diff = seedDifficulty || undefined;
    const sample: AttemptCreate = {
      role: r,
      score: 60 + Math.floor(Math.random() * 41),
      duration_min: 12 + Math.floor(Math.random() * 18),
      difficulty: diff,
    };
    try {
      await api.createAttempt(sample);
      await load();
    } catch (e: any) {
      setErr(e?.message || "Failed to create attempt");
    }
  }

  // delete attempt
  async function onDelete(id: string) {
    const ok = window.confirm("Delete this attempt?");
    if (!ok) return;
    try {
      await api.deleteAttempt(id);
      // optimistically update UI
      setAttempts((old) => old.filter((a) => a.id !== id));
    } catch (e: any) {
      setErr(e?.message || "Delete failed");
    }
  }

  // quick range helpers
  function setLastDays(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    setFrom(start.toISOString().slice(0, 10));
    setTo(end.toISOString().slice(0, 10));
    setPage(1);
  }
  function clearRange() {
    setFrom("");
    setTo("");
    setPage(1);
  }
  function toggleRole(r: string) {
    setSelectedRoles((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
    );
    setPage(1);
  }
  function selectAllRoles() {
    setSelectedRoles([]);
    setPage(1);
  }

  function clearFilters() {
    setSelectedRoles([]);
    setFrom("");
    setTo("");
    setPage(1);
  }

  // export CSV (filtered)
  function exportCsv() {
    const header = ["id", "role", "score", "date", "duration_min", "difficulty"];
    const rows = filtered.map((a) => [
      a.id,
      a.role,
      a.score,
      a.date,
      a.duration_min ?? "",
      (a as any).difficulty ?? "",
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((x) => `"${String(x).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "attempts.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-8">
      {/* Header + Seed */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            <span className="bg-gradient-to-r from-brand-200 to-accent-200 bg-clip-text text-transparent">
              Welcome back
            </span>
          </h1>
          <p className="mt-1 text-white/60">Here’s a quick overview of your progress.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Seed controls */}
          <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2 py-1.5">
            <select
              value={seedRole}
              onChange={(e) => setSeedRole(e.target.value)}
              className="rounded-lg bg-transparent text-sm outline-none"
            >
              {rolesFromApi.map((r) => (
                <option key={r} value={r} className="text-slate-900 dark:bg-[#0b0f1a] dark:text-brand-200">
                  {r}
                </option>
              ))}
            </select>
            <select
              value={seedDifficulty}
              onChange={(e) => setSeedDifficulty(e.target.value as any)}
              className="rounded-lg bg-transparent text-sm outline-none"
              title="(optional) tag difficulty in the attempt"
            >
              <option value="" className="text-slate-900 dark:bg-[#0b0f1a] dark:text-brand-200">
                any difficulty
              </option>
              <option value="easy" className="text-slate-900 dark:bg-[#0b0f1a] dark:text-brand-200">
                easy
              </option>
              <option value="medium" className="text-slate-900 dark:bg-[#0b0f1a] dark:text-brand-200">
                medium
              </option>
              <option value="hard" className="text-slate-900 dark:bg-[#0b0f1a] dark:text-brand-200">
                hard
              </option>
            </select>
            <button
              onClick={seedOne}
              className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-500"
              title="Create a sample attempt"
            >
              <Plus className="h-4 w-4" /> Seed
            </button>
          </div>

          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
            title="Export filtered attempts as CSV"
          >
            <Download className="h-4 w-4" /> Export CSV
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
                if (!selectedRoles.length) setSelectedRoles([r]);
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
            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10"
          >
            All time
          </button>

          <div className="mx-1 h-4 w-px bg-white/10" />

          <button
            onClick={clearFilters}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
            title="Clear all filters"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Clear filters
          </button>
        </div>
      </div>

      {/* Errors */}
      {err && (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-rose-200">
          {err}
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

      {/* Per-role summary with sparklines */}
      {!loading && perRole.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm text-white/60">Summary by role</h3>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {perRole.map((r) => (
              <div
                key={r.role}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="truncate text-sm font-medium">{r.role}</div>
                  <Sparkline values={r.spark} />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="text-xs text-white/60">Avg</div>
                  <div className="text-right text-lg font-semibold">{r.avg}</div>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <div className="text-xs text-white/60">Sessions</div>
                  <div className="text-right text-base">{r.sessions}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent Sessions (filtered + paginated) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Recent Sessions</h2>
          {!loading && (
            <div className="flex items-center gap-2">
              <button
                onClick={load}
                className="text-sm text-white/70 underline underline-offset-4 hover:text-white"
                title="Refresh"
              >
                Refresh
              </button>
              {filtered.length > PAGE_SIZE && (
                <div className="ml-2 inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg p-1 hover:bg-white/10"
                    title="Prev page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="px-1">
                    Page {pageSafe} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="rounded-lg p-1 hover:bg-white/10"
                    title="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
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
            {paged.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between bg-white/[0.03] px-4 py-3 hover:bg-white/[0.06]"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{a.role}</p>
                  <p className="text-xs text-white/60">{fmtDate(a.date)}</p>
                </div>
                <div className="flex items-center gap-4 sm:gap-6">
                  {(a as any).difficulty && (
                    <span
                      className={[
                        "hidden sm:inline-flex items-center rounded-xl px-2 py-1 text-xs ring-1",
                        difficultyPill((a as any).difficulty),
                      ].join(" ")}
                      title="Difficulty"
                    >
                      {(a as any).difficulty}
                    </span>
                  )}
                  <span className="text-sm text-white/70">{a.duration_min} min</span>
                  <span className={`text-xl font-bold ${scoreClass(a.score)}`}>{a.score}</span>
                  <button
                    onClick={() => onDelete(a.id)}
                    className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                    title="Delete"
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
