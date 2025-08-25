// src/lib/settings.ts
export type UserSettings = {
  name: string;
  email: string;
  preferredRole?: string;
};

const KEY = "intervue.settings.v1";

export function loadSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { name: "", email: "" };
    const parsed = JSON.parse(raw);
    return {
      name: typeof parsed.name === "string" ? parsed.name : "",
      email: typeof parsed.email === "string" ? parsed.email : "",
      preferredRole: typeof parsed.preferredRole === "string" ? parsed.preferredRole : undefined,
    };
  } catch {
    return { name: "", email: "" };
  }
}

export function saveSettings(s: UserSettings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}
