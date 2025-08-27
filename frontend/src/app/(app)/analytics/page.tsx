"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/Card";
import { api, type Attempt } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  ReferenceLine,
  LabelList,
} from "recharts";

/* --------------------------------- helpers -------------------------------- */

function fmtDateShort(iso: string) {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit" }).format(d);
  } catch {
    return iso;
  }
}

function movingAverage(values: number[], window: number): Array<number | null> {
  if (!window) return [];
  const out: Array<number | null> = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    if (i >= window - 1) out[i] = Math.round(sum / window);
  }
  return out;
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <div className="h-4 w-40 rounded bg-white/10" />
      <div className="mt-3 h-56 w-full rounded bg-white/10" />
    </div>
  );
}

const tipStyle: React.CSSProperties = {
  background: "rgba(17,24,39,.75)",
  border: "1px solid rgba(255,255,255,0.15)",
  backdropFilter: "blur(6px)",
  color: "white",
  borderRadius: 12,
};

/* ------------------------------- tiny UI bits ------------------------------ */

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

/** Wrapped multi-line role labels for the BarChart X axis */
function RoleTick({
  x = 0,
  y = 0,
  payload,
  maxLineLen = 14,
  maxLines = 2,
  yOffset = 12,
  lineHeight = 14,
}: {
  x?: number;
  y?: number;
  payload?: { value: string };
  maxLineLen?: number;
  maxLines?: number;
  yOffset?: number;
  lineHeight?: number;
}) {
  const value = payload?.value ?? "";
  const words = value.split(" ");
  const lines: string[] = [];
  let cur = "";

  for (const w of words) {
    if ((cur + (cur ? " " : "") + w).length <= maxLineLen) cur = cur ? `${cur} ${w}` : w;
    else {
      if (cur) lines.push(cur);
      if (w.length > maxLineLen) {
        lines.push(w.slice(0, maxLineLen - 1) + "…");
        cur = "";
      } else {
        cur = w;
      }
    }
  }
  if (cur) lines.push(cur);

  const wrapped = lines.slice(0, maxLines);
  if (lines.length > maxLines) wrapped[maxLines - 1] = wrapped[maxLines - 1].replace(/…?$/, "…");

  return (
    <g transform={`translate(${x},${y + yOffset})`}>
      <text textAnchor="middle" fill="currentColor" opacity={0.85} fontSize={12} dominantBaseline="hanging">
        {wrapped.map((line, i) => (
          <tspan key={i} x={0} dy={i === 0 ? 0 : lineHeight}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
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

/* ----------------------------------- page ---------------------------------- */

export default function AnalyticsPage() {
  // 🔁 Load attempts via SWR-lite hook (auto refresh + dedupe)
  const {
    data: attempts = [],
    loading,
    error,
    refetch,
  } = useApi<Attempt[]>(
    ["attempts", "analytics"],
    () => api.getAttempts({ limit: 500 }),
    { refreshInterval: 60_000, revalidateOnFocus: true, dedupeMs: 200 }
  );

  // filters
  const allRoles = useMemo(() => Array.from(new Set(attempts.map((a) => a.role))).sort(), [attempts]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]); // empty = all
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  // charts options
  const [metric, setMetric] = useState<"avg" | "sessions">("avg");
  const [stackByDiff, setStackByDiff] = useState(false);
  const [maWindow, setMaWindow] = useState<0 | 7>(7); // moving average
  const [showValues, setShowValues] = useState<boolean>(true);

  // show errors from hook
  const err = error?.message ?? null;

  // apply filters
  const filtered = useMemo(() => {
    const hasRoleFilter = selectedRoles.length > 0;
    const fromTime = from ? new Date(from + "T00:00:00").getTime() : -Infinity;
    const toTime = to ? new Date(to + "T23:59:59").getTime() : Infinity;

    // Sort ASC for line chart; hook returns newest-first but we need time-series left->right
    const asc = [...attempts].sort((a, b) => +new Date(a.date) - +new Date(b.date));

    return asc.filter((a) => {
      const t = new Date(a.date).getTime();
      const roleOk = hasRoleFilter ? selectedRoles.includes(a.role) : true;
      const dateOk = t >= fromTime && t <= toTime;
      return roleOk && dateOk;
    });
  }, [attempts, selectedRoles, from, to]);

  /* -------------------------- left chart (line) -------------------------- */

  const series = useMemo(() => filtered.map((a) => ({ date: fmtDateShort(a.date), score: a.score })), [filtered]);

  const avgScore = useMemo(() => {
    if (!filtered.length) return 0;
    return Math.round(filtered.reduce((acc, a) => acc + a.score, 0) / filtered.length);
  }, [filtered]);

  // moving average, aligned to series indexes
  const maValues = useMemo(() => movingAverage(filtered.map((a) => a.score), maWindow), [filtered, maWindow]);

  const lineData = useMemo(() => series.map((p, i) => ({ ...p, ma: maValues[i] })), [series, maValues]);

  /* ------------------------- right chart (bars) -------------------------- */

  // sessions by role
  const roleCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of filtered) map.set(a.role, (map.get(a.role) ?? 0) + 1);
    const rows = Array.from(map.entries()).map(([role, count]) => ({ role, count }));
    rows.sort((a, b) => b.count - a.count);
    return rows;
  }, [filtered]);

  // average score by role
  const avgByRole = useMemo(() => {
    const sums = new Map<string, { sum: number; n: number }>();
    for (const a of filtered) {
      const cur = sums.get(a.role) ?? { sum: 0, n: 0 };
      cur.sum += a.score;
      cur.n += 1;
      sums.set(a.role, cur);
    }
    const rows = Array.from(sums.entries()).map(([role, v]) => ({
      role,
      avg: Math.round(v.sum / v.n),
    }));
    rows.sort((a, b) => b.avg - a.avg);
    return rows;
  }, [filtered]);

  // sessions by role stacked by difficulty (if attempts carry difficulty)
  const stackedByDiff = useMemo(() => {
    const rows = new Map<string, { role: string; easy: number; medium: number; hard: number; unknown: number }>();
    for (const a of filtered) {
      const key = a.role;
      if (!rows.has(key)) rows.set(key, { role: key, easy: 0, medium: 0, hard: 0, unknown: 0 });
      const rec = rows.get(key)!;
      const d = (a as any).difficulty?.toLowerCase?.() as "easy" | "medium" | "hard" | undefined;
      if (d === "easy") rec.easy += 1;
      else if (d === "medium") rec.medium += 1;
      else if (d === "hard") rec.hard += 1;
      else rec.unknown += 1;
    }
    return Array.from(rows.values());
  }, [filtered]);

  // dataset for the right chart
  const dataForThisTab = useMemo(() => {
    if (metric === "avg") return avgByRole.map(({ role, avg }) => ({ role, avg }));
    if (stackByDiff) {
      return [...stackedByDiff].sort(
        (a, b) => b.easy + b.medium + b.hard + b.unknown - (a.easy + a.medium + a.hard + a.unknown)
      );
    }
    return roleCounts.map(({ role, count }) => ({ role, count }));
  }, [metric, stackByDiff, avgByRole, roleCounts, stackedByDiff]);

  // Y range with headroom for labels
  const yMax = useMemo(() => {
    if (metric === "avg") return 100;
    if (stackByDiff) {
      const max = Math.max(0, ...stackedByDiff.map((r) => r.easy + r.medium + r.hard + r.unknown));
      return max + 1;
    }
    const max = Math.max(0, ...roleCounts.map((r) => r.count));
    return max + 1;
  }, [metric, stackByDiff, stackedByDiff, roleCounts]);

  const showUnknown = useMemo(
    () => stackByDiff && stackedByDiff.some((r) => r.unknown > 0),
    [stackByDiff, stackedByDiff]
  );

  const empty = !loading && filtered.length === 0;

  /* -------------------------- controls helpers --------------------------- */

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
    setSelectedRoles([]); // empty = all
  }

  function exportCsv() {
    const rows = [
      ["id", "role", "score", "duration_min", "date", "difficulty"],
      ...filtered.map((a) => [a.id, a.role, String(a.score), String(a.duration_min), a.date, a.difficulty ?? ""]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* --------------------------------- render -------------------------------- */

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Analytics</h1>
          <p className="text-white/70">Visual insights about your performance.</p>
        </div>
        {!loading && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch().catch(() => {})}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
              title="Refresh data"
            >
              Refresh
            </button>
            <button
              onClick={exportCsv}
              className="rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500"
              title="Export filtered attempts"
            >
              Export CSV
            </button>
          </div>
        )}
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
        </div>
      </div>

      {err && (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-rose-200">
          {err}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <p className="text-sm text-white/70">
            No attempts for the selected filters. Adjust Role/Date above or seed more data.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Scores over time + moving average */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-white/60">Scores over time</p>
              <div className="flex gap-2">
                <Chip label="MA off" active={maWindow === 0} onClick={() => setMaWindow(0)} />
                <Chip label="MA 7" active={maWindow === 7} onClick={() => setMaWindow(7)} />
              </div>
            </div>

            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData} margin={{ left: 4, right: 12, top: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradScore" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#6366f1" />
                      <stop offset="100%" stopColor="#22d3ee" />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeOpacity={0.15} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "currentColor", opacity: 0.7, fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fill: "currentColor", opacity: 0.7, fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={tipStyle}
                    labelStyle={{ color: "white" }}
                    formatter={(val: any, name: string) => {
                      const safe = typeof val === "number" && Number.isFinite(val) ? val : "";
                      return [String(safe), name === "ma" ? "MA" : "Score"];
                    }}
                  />
                  <ReferenceLine
                    y={avgScore}
                    stroke="rgba(255,255,255,0.3)"
                    strokeDasharray="4 6"
                    ifOverflow="extendDomain"
                    label={{
                      value: `Avg ${avgScore}`,
                      fill: "rgba(255,255,255,.75)",
                      position: "right",
                      fontSize: 12,
                    }}
                  />
                  <Line type="monotone" dataKey="score" stroke="url(#gradScore)" strokeWidth={2.5} dot={false} isAnimationActive />
                  {maWindow > 0 && (
                    <Line
                      type="monotone"
                      dataKey="ma"
                      stroke="rgba(255,255,255,.7)"
                      strokeWidth={2}
                      dot={false}
                      strokeDasharray="6 6"
                      isAnimationActive
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Right card: Avg score ↔ Sessions (optionally stacked) */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-white/60">
                {metric === "avg"
                  ? "Average score by role"
                  : stackByDiff
                  ? "Sessions by role (stacked by difficulty)"
                  : "Sessions by role"}
              </p>
              <div className="flex gap-2">
                <Chip label="Avg score" active={metric === "avg"} onClick={() => setMetric("avg")} />
                <Chip label="Sessions" active={metric === "sessions"} onClick={() => setMetric("sessions")} />
                <Chip
                  label="Stack by difficulty"
                  active={stackByDiff}
                  onClick={() => setStackByDiff((v) => !v)}
                  disabled={metric !== "sessions"}
                />
                <Chip
                  label="Show values"
                  active={showValues}
                  onClick={() => setShowValues((v) => !v)}
                />
              </div>
            </div>

            {/* Legend for stacked mode */}
            {metric === "sessions" && stackByDiff && (
              <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-white/70">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded" style={{ backgroundColor: "#34d399" }} />
                  Easy
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded" style={{ backgroundColor: "#f59e0b" }} />
                  Medium
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded" style={{ backgroundColor: "#ef4444" }} />
                  Hard
                </span>
                {stackedByDiff.some((r) => r.unknown > 0) && (
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded" style={{ backgroundColor: "#9ca3af" }} />
                    Unknown
                  </span>
                )}
              </div>
            )}

            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dataForThisTab}
                  margin={{ left: 12, right: 12, top: 24, bottom: 64 }}
                  barCategoryGap={24}
                >
                  <defs>
                    <linearGradient id="gradBars" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#6366f1" />
                      <stop offset="100%" stopColor="#22d3ee" />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeOpacity={0.15} vertical={false} />

                  <XAxis
                    dataKey="role"
                    interval={0}
                    height={44}
                    tickMargin={8}
                    axisLine={false}
                    tickLine={false}
                    tick={<RoleTick yOffset={12} maxLineLen={14} maxLines={2} />}
                  />

                  <YAxis
                    domain={[0, yMax]}
                    allowDecimals={metric !== "avg"}
                    tick={{ fill: "currentColor", opacity: 0.8, fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />

                  <Tooltip
                    contentStyle={tipStyle}
                    labelStyle={{ color: "white" }}
                    formatter={(val: any, key: string) => {
                      const v = typeof val === "number" && Number.isFinite(val) ? val : 0;
                      if (metric === "avg") return [String(v), "Avg score"];
                      if (stackByDiff) {
                        const label =
                          key === "easy"
                            ? "Easy"
                            : key === "medium"
                            ? "Medium"
                            : key === "hard"
                            ? "Hard"
                            : "Unknown";
                        return [String(v), label];
                      }
                      return [String(v), "Sessions"];
                    }}
                  />

                  {metric === "avg" ? (
                    <Bar dataKey="avg" radius={[10, 10, 0, 0]} fill="url(#gradBars)">
                      {showValues && (
                        <LabelList
                          dataKey="avg"
                          position="top"
                          style={{ fill: "rgba(255,255,255,.9)", fontSize: 12 }}
                        />
                      )}
                    </Bar>
                  ) : stackByDiff ? (
                    <>
                      <Bar dataKey="easy" stackId="d" radius={[10, 10, 0, 0]} fill="#34d399">
                        {showValues && (
                          <LabelList dataKey="easy" position="top" style={{ fill: "rgba(255,255,255,.9)", fontSize: 11 }} />
                        )}
                      </Bar>
                      <Bar dataKey="medium" stackId="d" fill="#f59e0b">
                        {showValues && (
                          <LabelList dataKey="medium" position="top" style={{ fill: "rgba(255,255,255,.9)", fontSize: 11 }} />
                        )}
                      </Bar>
                      <Bar dataKey="hard" stackId="d" fill="#ef4444">
                        {showValues && (
                          <LabelList dataKey="hard" position="top" style={{ fill: "rgba(255,255,255,.9)", fontSize: 11 }} />
                        )}
                      </Bar>
                      {showUnknown && (
                        <Bar dataKey="unknown" stackId="d" fill="#9ca3af">
                          {showValues && (
                            <LabelList dataKey="unknown" position="top" style={{ fill: "rgba(255,255,255,.9)", fontSize: 11 }} />
                          )}
                        </Bar>
                      )}
                    </>
                  ) : (
                    <Bar dataKey="count" radius={[10, 10, 0, 0]} fill="url(#gradBars)">
                      {showValues && (
                        <LabelList dataKey="count" position="top" style={{ fill: "rgba(255,255,255,.9)", fontSize: 12 }} />
                      )}
                    </Bar>
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
