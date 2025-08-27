// src/app/(app)/bookmarks/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Copy, Play, Upload, Download, X } from "lucide-react";
import { toast } from "sonner";
import type { Bookmark } from "@/lib/bookmarks";
import {
  getBookmarks,
  removeBookmark,
  clearBookmarks,
  exportBookmarksCSV,
  importBookmarksFromRows,
  parseCSV,
} from "@/lib/bookmarks";
import { Card } from "@/components/Card";

function RoleChip({ label }: { label: string }) {
  return (
    <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/80">
      {label}
    </span>
  );
}

export default function BookmarksPage() {
  const router = useRouter();
  const [list, setList] = useState<Bookmark[]>([]);
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function load() {
    setList(getBookmarks());
  }
  useEffect(() => { load(); }, []);

  const roles = useMemo(
    () => Array.from(new Set(list.map((b) => b.role))).sort(),
    [list]
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    let out = roleFilter ? list.filter((b) => b.role === roleFilter) : list;
    if (s) {
      out = out.filter(
        (b) =>
          b.text.toLowerCase().includes(s) ||
          (b.topic || "").toLowerCase().includes(s) ||
          (b.difficulty || "").toLowerCase().includes(s)
      );
    }
    return out;
  }, [list, roleFilter, search]);

  function remove(b: Bookmark) {
    removeBookmark(b.id);
    setList((prev) => prev.filter((x) => x.id !== b.id));
    toast("Removed bookmark");
  }

  function copy(b: Bookmark) {
    navigator.clipboard.writeText(b.text).then(
      () => toast.success("Copied"),
      () => toast.error("Copy failed")
    );
  }

  function practice(b: Bookmark) {
    router.push(
      `/interview?role=${encodeURIComponent(b.role)}&focus=${encodeURIComponent(b.id)}`
    );
  }

  async function onImport(file: File) {
    try {
      const rows = await parseCSV(file);
      importBookmarksFromRows(rows);
      load();
      toast.success("Imported");
    } catch (e: any) {
      toast.error(e?.message || "Import failed");
    }
  }

  function doClear() {
    if (!confirm("Clear all bookmarks?")) return;
    clearBookmarks();
    load();
    toast("Cleared");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Bookmarks</h1>
        <p className="text-white/70">Your saved questions.</p>
      </div>

      {/* Toolbar */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-white/60">Roles:</span>
          {roles.map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(roleFilter === r ? "" : r)}
              className={[
                "rounded-xl px-3 py-1.5 text-xs transition-colors border",
                roleFilter === r
                  ? "bg-brand-600/20 text-white border-brand-400/30"
                  : "bg-white/5 text-white/80 border-white/10 hover:bg-white/10",
              ].join(" ")}
            >
              {r}
            </button>
          ))}
          <button
            onClick={() => setRoleFilter("")}
            className="ml-1 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10"
          >
            All
          </button>

          <div className="mx-2 h-4 w-px bg-white/10" />

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search text/topic/difficulty…"
            className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-sm text-white outline-none focus:border-brand-400/50"
          />

          <div className="mx-2 h-4 w-px bg-white/10" />

          <button
            onClick={() => exportBookmarksCSV()}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
            title="Export CSV"
          >
            <Download className="h-4 w-4" /> Export
          </button>

          <button
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
            title="Import CSV"
          >
            <Upload className="h-4 w-4" /> Import
          </button>

          <button
            onClick={doClear}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
            title="Clear all"
          >
            <X className="h-4 w-4" /> Clear
          </button>

          <input
            type="file"
            ref={fileRef}
            className="hidden"
            accept=".csv,text/csv"
            onChange={(e) => e.target.files && onImport(e.target.files[0])}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <p className="text-sm text-white/70">
            No bookmarks yet. Go to the Interview page and star a question.
          </p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-2xl divide-y divide-white/10 border border-white/10">
          {filtered.map((b) => (
            <div
              key={b.id}
              className="flex items-start justify-between bg-white/[0.03] px-4 py-3 hover:bg-white/[0.06]"
            >
              <div className="min-w-0">
                <p className="font-medium">{b.text}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <RoleChip label={b.role} />
                  {b.difficulty && <RoleChip label={b.difficulty} />}
                  {b.topic && <RoleChip label={b.topic} />}
                </div>
              </div>
              <div className="ml-4 flex items-center gap-2 shrink-0">
                <button
                  onClick={() => practice(b)}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-white/80 hover:bg-white/10"
                  title="Practice this question"
                >
                  <Play className="h-4 w-4" /> Practice
                </button>
                <button
                  onClick={() => copy(b)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                  title="Copy text"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  onClick={() => remove(b)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                  title="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
