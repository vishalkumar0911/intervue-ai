// src/app/(app)/bookmarks/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Copy, Play, Upload, Download, X, Search } from "lucide-react";
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
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

/* ------------------------------ tiny helpers ------------------------------ */

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
        "rounded-xl px-3 py-1.5 text-xs transition-colors border focus-ring",
        active
          ? "bg-primary/20 text-foreground border-primary/30"
          : "bg-secondary/60 text-muted-foreground border-border hover:bg-secondary",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function RolePill({ label }: { label: string }) {
  return <Badge variant="neutral">{label}</Badge>;
}

/* ---------------------------------- page ---------------------------------- */

export default function BookmarksPage() {
  const router = useRouter();
  const [list, setList] = useState<Bookmark[]>([]);
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function load() {
    // newest first if we have a created timestamp; otherwise keep as-is
    const data = getBookmarks();
    data.sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
    setList(data);
  }
  useEffect(() => {
    load();
  }, []);

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

  function onRemove(b: Bookmark) {
    removeBookmark(b.id);
    setList((prev) => prev.filter((x) => x.id !== b.id));
    toast("Removed bookmark");
  }

  function onCopy(b: Bookmark) {
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

  // Export filtered (if any filter/search is active) else export all via helper
  function onExport() {
    const filtering = Boolean(roleFilter || search.trim());
    if (!filtering) {
      exportBookmarksCSV();
      return;
    }
    // custom export for the filtered subset
    const rows = [
      ["id", "role", "text", "topic", "difficulty", "created"],
      ...filtered.map((b) => [
        b.id,
        b.role,
        b.text,
        b.topic ?? "",
        b.difficulty ?? "",
        b.created ?? "",
      ]),
    ];
    const csv = rows
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bookmarks_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Bookmarks</h1>
        <p className="text-muted-foreground">Your saved questions.</p>
      </div>

      {/* Toolbar */}
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Roles:</span>
          {roles.map((r) => (
            <Chip
              key={r}
              label={r}
              active={roleFilter ? roleFilter === r : true}
              onClick={() => {
                if (!roleFilter) setRoleFilter(r);
                else setRoleFilter(roleFilter === r ? "" : r);
              }}
            />
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRoleFilter("")}
            className="ml-1"
            aria-label="Show all roles"
            title="Show all roles"
          >
            All
          </Button>

          <div className="mx-2 h-4 w-px bg-border" />

          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search text / topic / difficulty…"
              className="w-64 rounded-xl border border-input bg-transparent pl-8 pr-8 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus-ring"
            />
            {search && (
              <button
                aria-label="Clear search"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground focus-ring"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="mx-2 h-4 w-px bg-border" />

          <Button variant="outline" size="sm" onClick={onExport} title="Export CSV">
            <Download className="h-4 w-4" />
            <span className="ml-2 hidden sm:inline">Export</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            title="Import CSV"
          >
            <Upload className="h-4 w-4" />
            <span className="ml-2 hidden sm:inline">Import</span>
          </Button>

          <Button variant="destructive" size="sm" onClick={doClear} title="Clear all">
            <X className="h-4 w-4" />
            <span className="ml-2 hidden sm:inline">Clear</span>
          </Button>

          <input
            type="file"
            ref={fileRef}
            className="hidden"
            accept=".csv,text/csv"
            onChange={(e) => e.target.files && onImport(e.target.files[0])}
          />
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            No bookmarks{roleFilter ? ` for “${roleFilter}”` : ""}. Go to the Interview page and
            star a question.
          </p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <div className="bg-secondary/60 px-4 py-2 text-xs text-muted-foreground">
            Showing {filtered.length} of {list.length}
          </div>

          <ul className="divide-y divide-border">
            {filtered.map((b) => (
              <li
                key={b.id}
                className="flex items-start justify-between bg-background/40 px-4 py-3 hover:bg-secondary/60"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{b.text}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <RolePill label={b.role} />
                    {b.difficulty && <RolePill label={b.difficulty} />}
                    {b.topic && <RolePill label={b.topic} />}
                  </div>
                </div>

                <div className="ml-4 flex items-center gap-2 shrink-0">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => practice(b)}
                    title="Practice this question"
                    className="gap-2"
                  >
                    <Play className="h-4 w-4" />
                    Practice
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onCopy(b)}
                    title="Copy text"
                    aria-label="Copy bookmark text"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => onRemove(b)}
                    title="Remove bookmark"
                    aria-label="Remove bookmark"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
