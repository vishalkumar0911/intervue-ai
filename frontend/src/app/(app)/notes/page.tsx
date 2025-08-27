// src/app/(app)/notes/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2, Download } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/Card";
import { getNote as getNoteForId, setNote as setNoteForId, exportNotesCSV } from "@/lib/notes";

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

  function load() {
    setAll(loadAllNotes());
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return all;
    return all.filter((n) => n.text.toLowerCase().includes(s) || n.id.toLowerCase().includes(s));
  }, [all, q]);

  function update(id: string, text: string) {
    setAll((prev) => prev.map((n) => (n.id === id ? { ...n, text } : n)));
    // debounce-ish save
    setTimeout(() => setNoteForId(id, text), 200);
  }

  function remove(id: string) {
    setNoteForId(id, "");
    setAll((prev) => prev.filter((n) => n.id !== id));
    toast("Deleted note");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Notes</h1>
          <p className="text-white/70">Your notes attached to questions.</p>
        </div>

        <button
          onClick={() => exportNotesCSV()}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
          title="Export notes as CSV"
        >
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search notes by text or question id…"
          className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-brand-400/50"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <p className="text-sm text-white/70">
            No notes yet. On the Interview page, open <b>Notes</b> and write something — they’ll appear here.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((n) => (
            <div key={n.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-white/60">Question ID: {n.id}</p>
                <button
                  onClick={() => remove(n.id)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                  title="Delete note"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <textarea
                value={n.text}
                onChange={(e) => update(n.id, e.target.value)}
                className="min-h-[120px] w-full rounded-lg border border-white/10 bg-black/20 p-3 text-sm outline-none focus:border-brand-400/60"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
