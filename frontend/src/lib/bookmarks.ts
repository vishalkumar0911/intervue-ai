// src/lib/bookmarks.ts
export type Bookmark = {
  id: string; // question id
  role: string;
  text: string;
  topic?: string | null;
  difficulty?: "easy" | "medium" | "hard" | null;
  created: number; // timestamp
};

const KEY = "interview:bookmarks:v2";

function load(): Record<string, Bookmark> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, Bookmark>;
  } catch {
    return {};
  }
}

function save(map: Record<string, Bookmark>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {}
}

/* ---------- CRUD ---------- */

export function getBookmarks(): Bookmark[] {
  const map = load();
  return Object.values(map).sort((a, b) => b.created - a.created);
}

export function upsertBookmark(b: Bookmark) {
  const map = load();
  map[b.id] = b;
  save(map);
}

export function removeBookmark(id: string) {
  const map = load();
  delete map[id];
  save(map);
}

export function clearBookmarks() {
  save({});
}

export function isBookmarked(id?: string) {
  if (!id) return false;
  const map = load();
  return !!map[id];
}

/* ---------- Export / Import ---------- */

export function exportBookmarksCSV() {
  const list = getBookmarks();
  const rows = [
    ["id", "role", "text", "topic", "difficulty", "created"],
    ...list.map((b) => [
      b.id,
      b.role,
      (b.text ?? "").replace(/\n/g, " "),
      b.topic ?? "",
      b.difficulty ?? "",
      String(b.created),
    ]),
  ];
  const csv = rows
    .map((row) => row.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "bookmarks.csv";
  a.click();
}

/** Accepts a parsed CSV array (each row is an array of strings). */
export function importBookmarksFromRows(rows: string[][]) {
  const map = load();
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => head.indexOf(name);

  const idIdx = idx("id");
  const roleIdx = idx("role");
  const textIdx = idx("text");
  const topicIdx = idx("topic");
  const diffIdx = idx("difficulty");
  const createdIdx = idx("created");

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const id = r[idIdx]?.trim();
    if (!id) continue;
    const b: Bookmark = {
      id,
      role: r[roleIdx] || "Unknown",
      text: r[textIdx] || "",
      topic: r[topicIdx] || null,
      difficulty:
        (r[diffIdx] as Bookmark["difficulty"]) || null,
      created: Number(r[createdIdx] || Date.now()),
    };
    map[id] = b;
  }
  save(map);
}

/** helper to parse a CSV text into string[][] */
export async function parseCSV(file: File): Promise<string[][]> {
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  return lines.map((line) => {
    // naive CSV split; handles quotes a bit
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQ = !inQ;
      } else if (ch === "," && !inQ) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  });
}
