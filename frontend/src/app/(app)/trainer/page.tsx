"use client";

import RequireRole from "@/components/auth/RequireRole";
import { Card } from "@/components/Card";
import { Button } from "@/components/ui/Button";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw, Upload, Download } from "lucide-react";

/**
 * Trainer starter
 * - “Question bank” mock UI. Replace in-memory array with your real API later.
 */
type DemoQuestion = {
  id: string;
  role: string;
  text: string;
  difficulty?: "easy" | "medium" | "hard";
};

export default function TrainerPage() {
  const [bank, setBank] = useState<DemoQuestion[]>([]);
  const [role, setRole] = useState("Frontend Developer");
  const [text, setText] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const seed: DemoQuestion[] = [
      { id: "q1", role: "Frontend Developer", text: "Explain reconciliation in React.", difficulty: "medium" },
      { id: "q2", role: "Backend Developer", text: "Describe eventual consistency.", difficulty: "hard" },
    ];
    const t = setTimeout(() => { setBank(seed); setLoading(false); }, 250);
    return () => clearTimeout(t);
  }, []);

  const filtered = useMemo(() => bank.filter(q => q.role === role), [bank, role]);

  function addQuestion() {
    if (!text.trim()) { toast.error("Enter a question"); return; }
    const q: DemoQuestion = { id: crypto.randomUUID(), role, text: text.trim(), difficulty };
    setBank(prev => [q, ...prev]);
    setText("");
    toast.success("Question added (demo)");
  }

  function exportCsv() {
    const rows = [["id","role","text","difficulty"], ...filtered.map(q => [q.id, q.role, q.text, q.difficulty ?? ""])];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "trainer_questions.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  function importCsv() {
    toast.message("Import not wired (demo)");
  }

  return (
    <RequireRole roles={["Trainer","Admin"]} mode="inline">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Trainer</h1>
            <p className="text-muted-foreground">Curate & manage the question bank.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => toast.message("Refreshed")} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button variant="outline" onClick={importCsv} className="gap-2">
              <Upload className="h-4 w-4" /> Import
            </Button>
            <Button onClick={exportCsv} className="gap-2">
              <Download className="h-4 w-4" /> Export
            </Button>
          </div>
        </div>

        {/* Add form */}
        <Card>
          <div className="grid gap-3 md:grid-cols-[1fr_220px_160px_auto]">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write a new question…"
              className="rounded-xl border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus-ring"
            />
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Role"
              className="rounded-xl border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus-ring"
            />
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as any)}
              className="rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus-ring"
            >
              <option value="easy"   className="bg-background text-foreground">easy</option>
              <option value="medium" className="bg-background text-foreground">medium</option>
              <option value="hard"   className="bg-background text-foreground">hard</option>
            </select>
            <Button onClick={addQuestion} className="gap-2">
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        </Card>

        {/* List */}
        <Card>
          <div className="mb-2 text-sm text-muted-foreground">Showing {filtered.length} for role “{role}”.</div>
          <ul className="divide-y divide-border">
            {loading ? (
              <li className="px-3 py-4 text-muted-foreground">Loading…</li>
            ) : filtered.length === 0 ? (
              <li className="px-3 py-4 text-muted-foreground">No questions yet.</li>
            ) : (
              filtered.map(q => (
                <li key={q.id} className="flex items-start justify-between px-3 py-3 hover:bg-secondary/50 rounded-lg">
                  <div className="min-w-0">
                    <p className="font-medium">{q.text}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{q.role} • {q.difficulty || "unknown"}</p>
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
