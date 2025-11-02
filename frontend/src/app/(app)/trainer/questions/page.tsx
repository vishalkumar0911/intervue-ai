"use client";

import React, { useEffect, useMemo, useState } from "react";
import RequireRole from "@/components/auth/RequireRole";
import { api, type Question } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/Card";
import { Check, Plus, RefreshCw, Trash2, X, Pencil } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";

type Diff = "" | "easy" | "medium" | "hard";

export default function TrainerQuestionsPage() {
  return (
    <RequireRole roles={["Trainer", "Admin"]}>
      <PageInner />
    </RequireRole>
  );
}

function PageInner() {
  const [roles, setRoles] = useState<string[]>([]);
  const [role, setRole] = useState<string>("");
  const [difficulty, setDifficulty] = useState<Diff>("");
  const [includeCore, setIncludeCore] = useState<boolean>(true);
  const [search, setSearch] = useState("");

  const [items, setItems] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await api.roles();
        if (alive) {
          setRoles(r);
          if (!role && r.length) setRole(r[0] || "");
        }
      } catch (e: any) {
        toast.error(e?.message || "Failed to load roles");
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = async () => {
    setLoading(true);
    try {
      const qs = await api.trainer.listQuestions({
        role: role || undefined,
        difficulty: (difficulty || null) as any,
        include_core: includeCore,
      });
      setItems(qs);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load questions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, difficulty, includeCore]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.text.toLowerCase().includes(q) ||
        (i.topic || "").toLowerCase().includes(q) ||
        i.role.toLowerCase().includes(q)
    );
  }, [items, search]);

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Trainer</h1>
          <p className="text-sm text-muted-foreground">
            Curate & manage the question bank.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={reload} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
      </header>

      {/* Controls */}
      <Card>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-1">
            <label className="mb-1 block text-sm text-muted-foreground">
              Role
            </label>
            <select
              className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm focus-ring"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {roles.map((r) => (
                <option
                  key={r}
                  value={r}
                  className="bg-white text-slate-900 dark:bg-slate-900 dark:text-white"
                >
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-1">
            <label className="mb-1 block text-sm text-muted-foreground">
              Difficulty
            </label>
            <select
              className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm focus-ring"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Diff)}
            >
              <option value="" className="bg-white dark:bg-slate-900">
                All
              </option>
              <option value="easy" className="bg-white dark:bg-slate-900">
                Easy
              </option>
              <option value="medium" className="bg-white dark:bg-slate-900">
                Medium
              </option>
              <option value="hard" className="bg-white dark:bg-slate-900">
                Hard
              </option>
            </select>
          </div>

          <div className="md:col-span-1">
            <label className="mb-1 block text-sm text-muted-foreground">
              Search
            </label>
            <Input
              placeholder="Text / topic…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="md:col-span-1 flex items-end">
            <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="rounded border-input bg-transparent"
                checked={includeCore}
                onChange={(e) => setIncludeCore(e.target.checked)}
              />
              Include core questions
            </label>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <Card elevated>
        <CardHeader>
          <CardTitle className="text-base">
            {loading ? "Loading…" : `Showing ${filtered.length} question(s)`}
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          {filtered.length === 0 && !loading ? (
            <div className="py-12 text-center text-muted-foreground">
              No questions found.
            </div>
          ) : (
            filtered.map((q) => (
              <Row
                key={q.id}
                q={q}
                onChanged={(updated) =>
                  setItems((prev) =>
                    prev.map((x) => (x.id === updated.id ? updated : x))
                  )
                }
                onDeleted={() =>
                  setItems((prev) => prev.filter((x) => x.id !== q.id))
                }
              />
            ))
          )}
        </CardContent>
      </Card>

      {createOpen && (
        <CreateModal
          roles={roles}
          defaultRole={role}
          onClose={() => setCreateOpen(false)}
          onCreated={(created) => {
            setCreateOpen(false);
            setItems((prev) => [created, ...prev]);
          }}
        />
      )}
    </div>
  );
}

/* ----------------------------- create modal ----------------------------- */

function CreateModal({
  roles,
  defaultRole,
  onClose,
  onCreated,
}: {
  roles: string[];
  defaultRole?: string;
  onClose: () => void;
  onCreated: (q: Question) => void;
}) {
  const [role, setRole] = useState<string>(defaultRole || roles[0] || "");
  const [topic, setTopic] = useState("");
  const [text, setText] = useState("");
  const [difficulty, setDifficulty] = useState<Diff>("easy");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!text.trim()) {
      toast.error("Question text is required");
      return;
    }
    setSaving(true);
    try {
      const created = await api.trainer.createQuestion({
        role,
        text: text.trim(),
        topic: topic.trim() || undefined,
        difficulty: difficulty || undefined,
        source: "trainer",
      });
      toast.success("Question created");
      onCreated(created);
    } catch (e: any) {
      toast.error(e?.message || "Failed to create question");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="fixed inset-x-0 top-[10%] z-50 mx-auto w-[min(720px,92vw)] rounded-2xl surface">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-base font-semibold">Create question</h3>
          <button
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-secondary/60 hover:bg-secondary focus-ring"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">
                Role
              </label>
              <select
                className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm focus-ring"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                {roles.map((r) => (
                  <option
                    key={r}
                    value={r}
                    className="bg-white text-slate-900 dark:bg-slate-900 dark:text-white"
                  >
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">
                Difficulty
              </label>
              <select
                className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm focus-ring"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as Diff)}
              >
                <option value="easy" className="bg-white dark:bg-slate-900">
                  Easy
                </option>
                <option value="medium" className="bg-white dark:bg-slate-900">
                  Medium
                </option>
                <option value="hard" className="bg-white dark:bg-slate-900">
                  Hard
                </option>
              </select>
            </div>
          </div>

          <Input
            label="Topic (optional)"
            placeholder="e.g., API, React, DB"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
          <Textarea
            label="Question"
            placeholder="Enter the interview question…"
            value={text}
            rows={5}
            onChange={(e) => setText(e.target.value)}
          />

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} isLoading={saving}>
              <Check className="h-4 w-4" />
              Create
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ------------------------------ row (edit) ------------------------------ */

function Row({
  q,
  onChanged,
  onDeleted,
}: {
  q: Question;
  onChanged: (q: Question) => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(q.text);
  const [topic, setTopic] = useState(q.topic ?? "");
  const [difficulty, setDifficulty] = useState<Diff>(
    (q.difficulty as Diff) || ""
  );
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.trainer.updateQuestion(q.id, {
        text: text.trim(),
        topic: topic.trim() || null,
        difficulty: (difficulty || null) as any,
      });
      toast.success("Saved");
      onChanged(updated);
      setEditing(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!confirm("Delete this question?")) return;
    setRemoving(true);
    try {
      await api.trainer.deleteQuestion(q.id);
      toast.success("Deleted");
      onDeleted();
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <RequireRole roles={["Trainer", "Admin"]} mode="redirect">
    <div className="py-4 first:pt-0 last:pb-0">
      {!editing ? (
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="font-medium leading-6">{q.text}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="neutral">{q.role}</Badge>
              {q.topic ? <Badge variant="info">{q.topic}</Badge> : null}
              {q.difficulty ? (
                <Badge
                  variant={
                    q.difficulty === "easy"
                      ? "success"
                      : q.difficulty === "medium"
                      ? "warning"
                      : "danger"
                  }
                >
                  {q.difficulty}
                </Badge>
              ) : null}
              {q.source ? <Badge variant="outline">{q.source}</Badge> : null}
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <button
              onClick={() => setEditing(true)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-secondary/60 hover:bg-secondary focus-ring"
              title="Edit"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={del}
              disabled={removing || q.readonly === true}
              className={clsx(
                "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-destructive hover:bg-destructive/10 focus-ring",
                q.readonly && "opacity-50 cursor-not-allowed"
              )}
              title={q.readonly ? "Core questions cannot be deleted" : "Delete"}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-border/60 p-3">
          <div className="grid gap-3 md:grid-cols-3">
            <Input
              label="Topic (optional)"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">
                Difficulty
              </label>
              <select
                className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm focus-ring"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as Diff)}
              >
                <option value="" className="bg-white dark:bg-slate-900">
                  —
                </option>
                <option value="easy" className="bg-white dark:bg-slate-900">
                  Easy
                </option>
                <option value="medium" className="bg-white dark:bg-slate-900">
                  Medium
                </option>
                <option value="hard" className="bg-white dark:bg-slate-900">
                  Hard
                </option>
              </select>
            </div>
          </div>

          <Textarea
            label="Question"
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button onClick={save} isLoading={saving}>
              <Check className="h-4 w-4" />
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
    </RequireRole>
  );
}
