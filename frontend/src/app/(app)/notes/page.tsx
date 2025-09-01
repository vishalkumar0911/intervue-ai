// src/app/(app)/notes/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Trash2, Download, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/Textarea";

import { Card } from "@/components/Card";
import { Button } from "@/components/ui/Button";
import { exportNotesCSV, setNote as setNoteForId } from "@/lib/notes";

/** We store notes in localStorage as { [questionId]: text }. */
function loadAllNotes(): Array<{ id: string; text: string }> {
  try {
    const raw = localStorage.getItem("interview:notes");
    if (!raw) return [];
    const map = JSON.parse(raw) as Record<string, string>;
    return Object.entries(map)
      .map(([id, text]) => ({ id, text }))
      .sort((a, b) => a.id.localeCompare(b.id));
  } catch {
    return [];
  }
}

export default function NotesPage() {
  const [all, setAll] = useState<Array<{ id: string; text: string }>>([]);
  const [q, setQ] = useState("");
  const saveTimers = useRef<Record<string, number>>({}); // debounce per note

  function reload() {
    setAll(loadAllNotes());
  }
  useEffect(() => {
    reload();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return all;
    return all.filter(
      (n) => n.text.toLowerCase().includes(s) || n.id.toLowerCase().includes(s)
    );
  }, [all, q]);

  function update(id: string, text: string) {
    setAll((prev) => prev.map((n) => (n.id === id ? { ...n, text } : n)));

    // light debounce per-id to reduce localStorage churn
    const timers = saveTimers.current;
    if (timers[id]) window.clearTimeout(timers[id]);
    timers[id] = window.setTimeout(() => {
      setNoteForId(id, text);
      delete timers[id];
    }, 300);
  }

  function remove(id: string) {
    // clearing a note is “delete” in our storage model
    setNoteForId(id, "");
    setAll((prev) => prev.filter((n) => n.id !== id));
    toast("Deleted note");
  }

  function onExport() {
    if (!q.trim()) {
      exportNotesCSV();
      return;
    }
    // Export only the filtered subset
    const rows = [
      ["id", "text"],
      ...filtered.map((n) => [n.id, n.text]),
    ];
    const csv = rows
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `notes_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const empty = filtered.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Notes</h1>
          <p className="text-muted-foreground">Your notes attached to questions.</p>
        </div>

        <Button variant="outline" size="sm" onClick={onExport} title="Export notes as CSV">
          <Download className="h-4 w-4" />
          <span className="ml-2 hidden sm:inline">Export CSV</span>
        </Button>
      </div>

      {/* Search */}
      <Card>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search notes by text or question id…"
            className="w-full rounded-xl border border-input bg-transparent pl-9 pr-9 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus-ring"
          />
          {q && (
            <button
              aria-label="Clear search"
              onClick={() => setQ("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground focus-ring"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </Card>

      {/* List */}
      {empty ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            {q
              ? "No notes match your search."
              : (
                <>
                  No notes yet. On the Interview page, open <b>Notes</b> and write something — they’ll appear here.
                </>
              )}
          </p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <div className="bg-secondary/60 px-4 py-2 text-xs text-muted-foreground">
            Showing {filtered.length} of {all.length}
          </div>

          <ul className="divide-y divide-border">
            {filtered.map((n) => (
              <li key={n.id} className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Question ID: {n.id}</p>
                  <Button
                    variant="destructive"
                    size="sm"
                    title="Delete note"
                    aria-label={`Delete note ${n.id}`}
                    onClick={() => remove(n.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <Textarea
                  value={n.text}
                  onChange={(e) => update(n.id, e.target.value)}
                  placeholder="Write your thoughts, structure, hints…"
                  className="min-h-[120px]"
                />

              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
