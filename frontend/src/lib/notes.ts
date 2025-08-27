// src/lib/notes.ts
const KEY = "interview:notes";

type NotesMap = Record<string, string>;

function load(): NotesMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as NotesMap;
  } catch {
    return {};
  }
}

function save(map: NotesMap) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {}
}

export function getNote(qid?: string): string {
  if (!qid) return "";
  const map = load();
  return map[qid] || "";
}

export function setNote(qid: string, text: string) {
  const map = load();
  if (text.trim() === "") delete map[qid];
  else map[qid] = text;
  save(map);
}

export function deleteNote(qid: string) {
  const map = load();
  delete map[qid];
  save(map);
}

export function exportNotesCSV() {
  const map = load();
  const rows = [["question_id", "note"]];
  for (const [id, text] of Object.entries(map)) {
    rows.push([id, text.replace(/\n/g, " ")]);
  }
  const csv = rows.map((r) => r.map((x) => `"${x.replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "notes.csv";
  a.click();
}
