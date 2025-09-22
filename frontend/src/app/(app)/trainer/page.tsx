"use client";

import RequireRole from "@/components/auth/RequireRole";
import { Card } from "@/components/Card";
import { Button } from "@/components/ui/Button";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw, Upload, Download, Pencil, Trash2 } from "lucide-react";
import { api, type Question } from "@/lib/api";

type Diff = "all" | "easy" | "medium" | "hard";

export default function TrainerPage() {
  const [bank, setBank] = useState<Question[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [role, setRole] = useState<string>("");
  const [text, setText] = useState("");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<Diff>("all");
  const [loading, setLoading] = useState(false);

  // Load roles once
  useEffect(() => {
    (async () => {
      try {
        const rs = await api.roles();
        setRoles(rs);
        if (!role && rs.length) setRole(rs[0]);
      } catch {
        toast.error("Failed to load roles");
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    if (!role) return;
    setLoading(true);
    try {
      const rows = await api.trainer.listQuestions({
        role,
        difficulty: difficulty === "all" ? null : difficulty,
        include_core: true,
      });
      setBank(rows);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load questions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [role, difficulty]); // reload when role/difficulty changes

  const filtered = useMemo(() => bank, [bank]);

  async function addQuestion() {
    if (!text.trim()) {
      toast.error("Enter a question");
      return;
    }
    try {
      const q = await api.trainer.createQuestion({
        role,
        text: text.trim(),
        topic: topic.trim() || undefined,
        difficulty: difficulty === "all" ? undefined : difficulty,
      });
      setBank((prev) => [q, ...prev]);
      setText("");
      setTopic("");
      toast.success("Question added");
    } catch (err: any) {
      toast.error(err?.message || "Failed to add");
    }
  }

  async function updateQuestion(id: string, patch: Partial<Question>) {
    try {
      const q = await api.trainer.updateQuestion(id, patch);
      setBank((prev) => prev.map((x) => (x.id === id ? q : x)));
      toast.success("Question updated");
    } catch (err: any) {
      toast.error(err?.message || "Failed to update");
    }
  }

  async function deleteQuestion(id: string) {
    try {
      await api.trainer.deleteQuestion(id);
      setBank((prev) => prev.filter((x) => x.id !== id));
      toast.success("Question deleted");
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete");
    }
  }

  function exportCsv() {
    const rows = [
      ["id", "role", "text", "topic", "difficulty", "source"],
      ...filtered.map((q) => [
        q.id,
        q.role,
        q.text,
        q.topic ?? "",
        q.difficulty ?? "",
        q.source ?? "trainer",
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "trainer_questions.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <RequireRole roles={["Trainer", "Admin"]} mode="inline">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Trainer</h1>
            <p className="text-muted-foreground">Curate & manage the question bank.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={load} className="gap-2" isLoading={loading}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button variant="outline" onClick={() => toast.message("Import not wired")} className="gap-2">
              <Upload className="h-4 w-4" /> Import
            </Button>
            <Button onClick={exportCsv} className="gap-2">
              <Download className="h-4 w-4" /> Export
            </Button>
          </div>
        </div>

        {/* Add form */}
        <Card>
          <div className="grid gap-3 md:grid-cols-[1fr_200px_180px_160px_auto]">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write a new question…"
              className="rounded-xl border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus-ring"
            />

            {/* Topic (new) */}
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Topic (e.g., React, DB, System Design)"
              className="rounded-xl border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus-ring"
            />

            {/* Role dropdown */}
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus-ring max-h-40 overflow-y-auto"
            >
              {roles.map((r) => (
                <option key={r} value={r} className="bg-background text-foreground">
                  {r}
                </option>
              ))}
            </select>

            {/* Difficulty with "All" */}
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Diff)}
              className="rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus-ring"
            >
              <option value="all" className="bg-background text-foreground">
                All
              </option>
              <option value="easy" className="bg-background text-foreground">
                easy
              </option>
              <option value="medium" className="bg-background text-foreground">
                medium
              </option>
              <option value="hard" className="bg-background text-foreground">
                hard
              </option>
            </select>

            <Button onClick={addQuestion} className="gap-2">
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        </Card>

        {/* List */}
        <Card>
          <div className="mb-2 text-sm text-muted-foreground">
            Showing {filtered.length} for role “{role}”.
          </div>
          <ul className="divide-y divide-border">
            {loading ? (
              <li className="px-3 py-4 text-muted-foreground">Loading…</li>
            ) : filtered.length === 0 ? (
              <li className="px-3 py-4 text-muted-foreground">No questions yet.</li>
            ) : (
              filtered.map((q) => (
                <li
                  key={q.id}
                  className="flex items-start justify-between px-3 py-3 hover:bg-secondary/50 rounded-lg"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {q.text}
                      {q.source === "core" && (
                        <span className="ml-2 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
                          core
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {q.role}
                      {q.topic ? ` • ${q.topic}` : ""} • {q.difficulty || "unknown"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        const t = prompt("Edit question text", q.text) ?? q.text;
                        if (t.trim() && t !== q.text) updateQuestion(q.id, { text: t.trim() });
                      }}
                      className="gap-2"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => deleteQuestion(q.id)}
                      className="gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </Card>
      </div>
    </RequireRole>
  );
}
